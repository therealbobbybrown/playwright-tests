// tests/functional/objectives/objective-period-display-details.spec.js
// Phase 6: Отображение периода на странице деталей цели (DEVAPR-11585)

import { test } from "../../fixtures/auth-api.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { safeDeleteObjective } from "../../utils/api/test-helpers.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

test.describe(
  "Цели — Формат периода на деталях цели",
  { tag: ["@ui", "@objectives", "@regression"] },
  () => {
    let createdObjectiveId = null;
    let objectivesAPIRef = null;

    test.beforeAll(async ({ objectivesAPI }) => {
      objectivesAPIRef = objectivesAPI;
      const suffix = Math.floor(Math.random() * 100000) + 1;

      const userId = objectivesAPI.getCurrentUserId();
      if (!userId) {
        throw new Error("Не удалось получить ID текущего пользователя из токена");
      }

      const { response, data } = await objectivesAPI.saveObjective({
        title: `PERIOD-DETAILS-Q3-${suffix}`,
        description: "Тест отображения периода на деталях",
        startDate: "2026-07-01",
        endDate: "2026-09-30",
        status: "active",
        level: "self",
        responsibleUserId: userId,
        userAccessType: "everybody",
        milestones: [
          {
            temporaryId: `temp-details-q3-${suffix}`,
            title: "КР для теста периода на деталях",
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

    test("C8124: Формат периода на деталях цели: DD.MM.YYYY - DD.MM.YYYY",
      { tag: [] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const objectiveDetailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step("Перейти на страницу деталей цели", async () => {
          await page.goto(`/ru/objectives/view/${createdObjectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Проверить отображение периода Q3 2026: «01.07.2026 - 30.09.2026»", async () => {
          await objectiveDetailsPage.assertPeriodDisplay("01.07.2026 - 30.09.2026");
        });
      },
    );
  },
);
