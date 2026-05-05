// tests/functional/objectives/objective-approval-enable-existing-approved.spec.js
// TestRail: C-APPROVAL-TOGGLE-01 — Включение утверждения: существующие active цели получают статус «Утверждено»
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

let initialApprovalEnabled = null;
const createdObjectiveIds = [];

test.describe(
  "Утверждение целей — включение: существующие цели получают «Утверждено»",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Сохраняем начальное состояние
      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Выключаем утверждение, чтобы созданные ниже цели не получили approvalStatus
      const { response: disableResp } = await api.setApprovalEnabled(false);
      if (!disableResp.ok()) {
        throw new Error(
          `Не удалось выключить утверждение целей: ${disableResp.status()}`,
        );
      }

      // Создаём 2 активных цели через API от admin (без статуса утверждения)
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const adminUserId = api.getCurrentUserId();

      for (let i = 1; i <= 2; i++) {
        const uniqueId = Date.now() + i;
        const { response: createResp, data: createData } =
          await api.saveObjective({
            title: `Цель для проверки toggle-enable ${uniqueId}`,
            startDate,
            endDate,
            status: "active",
            level: "self",
            responsibleUserId: adminUserId,
            userAccessType: "everybody",
            milestones: [
              {
                temporaryId: `temp-toggle-enable-${uniqueId}`,
                title: `КР цели toggle-enable ${uniqueId}`,
                type: "percent",
                weight: 100,
                progress: 0,
                responsibleUserId: adminUserId,
              },
            ],
          });

        if (!createResp.ok()) {
          throw new Error(
            `Не удалось создать цель #${i} через API: ${createResp.status()} ${JSON.stringify(createData)}`,
          );
        }

        const objId = createData?.id;
        if (!objId) {
          throw new Error(
            `API не вернул ID для цели #${i}. Ответ: ${JSON.stringify(createData)}`,
          );
        }

        createdObjectiveIds.push(objId);
        console.log(`[beforeAll] Создана цель id=${objId} (без утверждения)`);
      }
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем все созданные цели
      for (const id of createdObjectiveIds) {
        await api.deleteObjective(id).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ${id}: ${e.message}`,
          );
        });
      }
      createdObjectiveIds.length = 0;

      // Восстанавливаем исходное состояние настройки утверждения
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
    });

    test("C8288: Включение утверждения — существующие active цели получают «Утверждено»",
      { tag: ["@critical"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("critical");

        if (createdObjectiveIds.length < 2) {
          throw new Error(
            "createdObjectiveIds не заполнен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        await test.step("Включить утверждение целей через API", async () => {
          const { response } = await api.setApprovalEnabled(true);
          expect(
            response.ok(),
            `Не удалось включить утверждение: ${response.status()}`,
          ).toBe(true);
        });

        await test.step(
          "API: GET каждой цели — approvalStatus === 'approved'",
          async () => {
            for (const objId of createdObjectiveIds) {
              const { response, data } = await api.getObjectiveById(objId);
              expect(
                response.ok(),
                `GET /private/objectives/${objId}/ вернул ${response.status()}`,
              ).toBe(true);

              const obj = data?.objective || data;
              // Бриф: "при первом включении все ранее созданные получают статус утверждено"
              // APP_BUG?: реальное поведение — approvalWaiting вместо approved. Тест по брифу.
              expect(
                obj?.approvalStatus,
                `Цель id=${objId}: по брифу должна получить 'approved', получено '${obj?.approvalStatus}'. Возможен APP_BUG.`,
              ).toBe("approved");
            }
          },
        );

        await test.step(
          "UI: открыть список целей и найти цели по заголовку",
          async () => {
            await page.goto("/ru/objectives/");
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
            await objectivesAllPage.assertOpened();
          },
        );

        await test.step(
          "UI: колонка «Статус» видна в таблице целей",
          async () => {
            const objectivesAllPage = new ObjectivesAllPage(page, testInfo);
            await objectivesAllPage.assertStatusColumnVisible();
          },
        );

        await test.step(
          "UI: хотя бы одна из созданных целей отображает статус утверждения",
          async () => {
            // Ищем цель по уникальному заголовку через поиск, чтобы не зависеть от пагинации
            const titlePrefix = "Цель для проверки toggle-enable";
            const searchBox = page.getByRole("textbox", { name: "Найти цель" });
            await searchBox.fill(titlePrefix);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const matchingRows = page
              .locator('tr[class*="ObjectiveRow_row__"]')
              .filter({ hasText: titlePrefix });

            await matchingRows.first().waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

            const count = await matchingRows.count();
            expect(
              count,
              `Ожидалось хотя бы 1 строка с заголовком "${titlePrefix}", найдено: ${count}`,
            ).toBeGreaterThan(0);

            // По брифу: при включении существующие цели получают статус "Утверждено"
            await expect(
              matchingRows.first(),
              'Строка цели должна содержать статус "Утверждено" (по брифу)',
            ).toContainText("Утверждено");
          },
        );
      },
    );
  },
);
