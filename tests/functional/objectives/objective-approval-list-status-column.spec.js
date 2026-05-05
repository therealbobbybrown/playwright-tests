// tests/functional/objectives/objective-approval-list-status-column.spec.js
// TestRail: C-APPROVAL-LIST-01 — Колонка "Статус" видна при включённом утверждении
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

// Три цели в разных статусах утверждения
const OBJECTIVE_STATUSES = [
  { approvalStatus: "approvalWaiting", label: "Требует утверждения" },
  { approvalStatus: "approvalProcess", label: "На утверждении" },
  { approvalStatus: "approved",        label: "Утверждено" },
];

test.describe(
  "Утверждение целей — колонка «Статус» в списке",
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

      // Создаём цели от user, чтобы sendForApproval работал корректно
      const userApi = new ObjectivesAPI(request);
      const userCreds = getCredentials("user");
      await userApi.signIn(userCreds.email, userCreds.password);
      const userId = userApi.getCurrentUserId();

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      for (let i = 0; i < OBJECTIVE_STATUSES.length; i++) {
        const { approvalStatus } = OBJECTIVE_STATUSES[i];
        const { response, data } = await userApi.saveObjective({
          title: `[E2E] Статус ${approvalStatus} ${uniqueId}-${i}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-${approvalStatus}-${uniqueId}-${i}`,
              title: `КР цели ${approvalStatus} ${uniqueId}-${i}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

        if (!response.ok()) {
          throw new Error(
            `Не удалось создать цель (${approvalStatus}): ${response.status()} ${JSON.stringify(data)}`,
          );
        }

        const objectiveId = data?.id;
        if (!objectiveId) {
          throw new Error(
            `API не вернул ID созданной цели (${approvalStatus}). Ответ: ${JSON.stringify(data)}`,
          );
        }

        objectiveIds.push(objectiveId);

        // Переводим цель в нужный статус: user отправляет, admin/head утверждает
        if (approvalStatus === "approvalProcess") {
          await userApi.sendForApproval(objectiveId);
        } else if (approvalStatus === "approved") {
          await userApi.sendForApproval(objectiveId);
          await api.approveObjective(objectiveId);
        }

        console.log(
          `[beforeAll] Создана цель id=${objectiveId} approvalStatus=${approvalStatus}`,
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

    test("C8293: Колонка «Статус» видна при включённом утверждении и содержит правильные значения",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        if (objectiveIds.length < OBJECTIVE_STATUSES.length) {
          throw new Error(
            "objectiveIds не заполнены — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const objectivesPage = new ObjectivesAllPage(page);

        await test.step("Открыть список целей", async () => {
          await page.goto("/ru/objectives/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await objectivesPage.assertOpened();
        });

        await test.step('Проверить что колонка "Статус" отображается в таблице', async () => {
          await objectivesPage.assertStatusColumnVisible();
        });

        await test.step('Проверить что фильтр "Статус" отображается над таблицей', async () => {
          await objectivesPage.assertStatusFilterVisible();
        });

        await test.step(
          "Найти тестовые цели через поиск и проверить статус каждой",
          async () => {
            const searchBox = page.getByRole("textbox", { name: "Найти цель" });

            for (let i = 0; i < OBJECTIVE_STATUSES.length; i++) {
              const { approvalStatus, label } = OBJECTIVE_STATUSES[i];
              // Ищем по уникальному title, чтобы не зависеть от пагинации
              const searchQuery = `[E2E] Статус ${approvalStatus}`;

              await searchBox.fill(searchQuery);
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});

              const row = page
                .locator('tr[class*="ObjectiveRow_row__"]')
                .filter({ hasText: searchQuery })
                .first();

              await row.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

              // Проверяем статус в 5-й колонке (index 4)
              const statusCell = row.locator("td").nth(4);
              await expect(
                statusCell,
                `Цель "${approvalStatus}" должна показывать статус "${label}"`,
              ).toHaveText(label);
            }

            // Очистить поиск
            await searchBox.clear();
          },
        );
      },
    );
  },
);
