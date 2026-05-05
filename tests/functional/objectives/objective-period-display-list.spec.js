// tests/functional/objectives/objective-period-display-list.spec.js
// Phase 6: Отображение периода в колонке таблицы списка целей (DEVAPR-11585)

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth-api.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Формат отображения периода в списке",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let createdObjectiveId = null;
    let objectivesAPIRef = null;
    let objectiveTitle = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      const suffix = Math.floor(Math.random() * 100000) + 1;
      objectiveTitle = `PERIOD-LIST-Q2-${suffix}`;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      const { response, data } = await objectivesAPI.saveObjective({
        title: objectiveTitle,
        description: "Тест отображения периода в списке",
        startDate: "2026-04-01",
        endDate: "2026-06-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-list-q2-${suffix}`,
            title: "КР для теста периода",
            type: "percent",
            weight: 100,
            progress: 0,
            responsibleUserId: userId,
          },
        ],
      });

      if (!response.ok()) {
        throw new Error(`Не удалось создать цель: ${response.status()} — ${JSON.stringify(data)}`);
      }

      createdObjectiveId = data?.id;
      if (!createdObjectiveId) {
        throw new Error("Сервер не вернул ID созданной цели");
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test.afterAll(async () => {
      if (createdObjectiveId && objectivesAPIRef) {
        await safeDeleteObjective(objectivesAPIRef, createdObjectiveId);
      }
    });

    test("C8126: Формат периода в колонке таблицы: DD.MM.YYYY - DD.MM.YYYY",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectivesAllPage = new ObjectivesAllPage(page, testInfo);

        await test.step("Перейти на страницу списка целей", async () => {
          await page.goto("/ru/objectives/");
          await objectivesAllPage.title.waitFor({ state: "visible", timeout: TIMEOUTS.LONG });
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step('Переключиться на вкладку "Все цели"', async () => {
          await objectivesAllPage.switchToTab("all");
        });

        await test.step('Найти строку с созданной целью и проверить колонку "Период"', async () => {
          // Используем поиск вместо пагинации
          const searchBox = page.getByRole("textbox", { name: /Найти цель/i });
          await searchBox.fill(objectiveTitle);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM }).catch(() => {});

          const targetRow = objectivesAllPage.tableRows
            .filter({ hasText: objectiveTitle })
            .first();
          await targetRow.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

          // Проверяем что в строке содержится ожидаемый период в формате DD.MM.YYYY - DD.MM.YYYY
          await expect(targetRow).toContainText("01.04.2026 - 30.06.2026");
        });
      },
    );
  },
);
