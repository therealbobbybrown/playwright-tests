// tests/functional/objectives/objective-approval-status-filter.spec.js
// TestRail: C-APPROVAL-FILTER-01 — Фильтрация по статусу утверждения
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAllPage } from "../../../pages/ObjectivesAllPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let objectiveIds = [];
let initialApprovalEnabled = null;

// Цели создаются по одной для каждого статуса
const APPROVAL_STATUSES = [
  { apiStatus: "approvalWaiting", uiLabel: "Требует утверждения" },
  { apiStatus: "approvalProcess", uiLabel: "На утверждении" },
  { apiStatus: "approved",        uiLabel: "Утверждено" },
];

test.describe(
  "Утверждение целей — фильтрация по статусу в списке",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Сохраняем исходное состояние настройки утверждения
      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей
      const { response: enableResp } = await api.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      // Создаём цели от user для корректных переходов (sendForApproval работает от автора)
      const userApi = new ObjectivesAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);
      const userId = userApi.getCurrentUserId();

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      for (let i = 0; i < APPROVAL_STATUSES.length; i++) {
        const { apiStatus, uiLabel } = APPROVAL_STATUSES[i];

        const { response, data } = await userApi.saveObjective({
          title: `[E2E] Фильтр ${apiStatus} ${uniqueId}-${i}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-filter-${apiStatus}-${uniqueId}-${i}`,
              title: `КР фильтр ${apiStatus} ${uniqueId}-${i}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

        if (!response.ok()) {
          throw new Error(
            `Не удалось создать цель (${uiLabel}): ${response.status()} ${JSON.stringify(data)}`,
          );
        }

        const objectiveId = data?.id;
        if (!objectiveId) {
          throw new Error(
            `API не вернул ID созданной цели (${uiLabel}). Ответ: ${JSON.stringify(data)}`,
          );
        }

        objectiveIds.push(objectiveId);

        // Переводим: user отправляет, admin утверждает
        if (apiStatus === "approvalProcess") {
          const { response: statusResp } = await userApi.sendForApproval(objectiveId);
          if (!statusResp.ok()) {
            throw new Error(
              `Не удалось отправить на утверждение цель ${objectiveId}: ${statusResp.status()}`,
            );
          }
        } else if (apiStatus === "approved") {
          await userApi.sendForApproval(objectiveId);
          const { response: statusResp } = await api.approveObjective(objectiveId);
          if (!statusResp.ok()) {
            throw new Error(
              `Не удалось утвердить цель ${objectiveId}: ${statusResp.status()}`,
            );
          }
        }

        console.log(
          `[beforeAll] Создана цель id=${objectiveId} approvalStatus=${apiStatus}`,
        );
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем созданные цели
      for (const id of objectiveIds) {
        await api.deleteObjective(id).catch((e) => {
          console.warn(`[afterAll] Не удалось удалить цель ${id}: ${e.message}`);
        });
      }
      objectiveIds = [];

      // Восстанавливаем исходную настройку утверждения
      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
      setSeverity("critical");
    });

    test("C8309: Фильтрация по статусу утверждения показывает только строки с выбранным статусом",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        if (objectiveIds.length < APPROVAL_STATUSES.length) {
          throw new Error(
            "objectiveIds не заполнены — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const objectivesPage = new ObjectivesAllPage(page);

        await test.step("Открыть список всех целей", async () => {
          await page.goto("/ru/objectives/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await objectivesPage.assertOpened();
          // Переключаемся на "Все цели" — seed-цели созданы от user, admin видит их только тут
          await page.getByRole("button", { name: "Все цели" }).click();
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        await test.step(
          'Фильтр "Требует утверждения" — все строки имеют этот статус',
          async () => {
            await objectivesPage.filterByStatus("Требует утверждения");
            await objectivesPage.assertAllRowsHaveStatus("Требует утверждения");
          },
        );

        await test.step(
          'Фильтр "На утверждении" — все строки имеют этот статус',
          async () => {
            await objectivesPage.filterByStatus("На утверждении");
            await objectivesPage.assertAllRowsHaveStatus("На утверждении");
          },
        );

        await test.step(
          'Фильтр "Утверждено" — все строки имеют этот статус',
          async () => {
            await objectivesPage.filterByStatus("Утверждено");
            await objectivesPage.assertAllRowsHaveStatus("Утверждено");
          },
        );

        await test.step(
          'Фильтр "Все статусы" — в таблице есть строки (count > 0)',
          async () => {
            await objectivesPage.filterByStatus("Все статусы");
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            const rowCount = await objectivesPage.tableRows.count();
            expect(
              rowCount,
              'После сброса фильтра на "Все статусы" таблица должна содержать хотя бы одну строку',
            ).toBeGreaterThan(0);
          },
        );
      },
    );
  },
);
