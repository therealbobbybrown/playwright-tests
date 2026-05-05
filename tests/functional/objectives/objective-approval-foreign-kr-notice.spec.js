// tests/functional/objectives/objective-approval-foreign-kr-notice.spec.js
// TestRail: C-APPROVAL-FKRN-01 — Уведомление о чужом ответственном КР при утверждении цели (DEVAPR-11722)
//
// Сценарий: когда admin смотрит цель со статусом "approvalProcess",
// а ответственный за КР — пользователь (user) НЕ из его прямых подчинённых,
// на странице отображается предупреждение:
//   "Владелец ключевого результата не из вашей команды.
//    Пожалуйста, перед утверждением цели, убедитесь что он согласован с руководителем этого сотрудника"
//
// Подтверждено через MCP-браузер инспекцию реального DOM.
//
// Негативная проверка: когда admin просматривает цель, где КР ответственный — сам admin,
// уведомление НЕ отображается.

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectiveDetailsPage } from "../../../pages/ObjectiveDetailsPage.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

// IDs создаются динамически в beforeAll, очищаются в afterAll
let foreignKrObjectiveId = null; // цель user'а — КР на user'а (не из команды admin)
let ownKrObjectiveId = null;     // цель admin'а — КР на admin'а (сам утверждающий)
let initialApprovalEnabled = null;

// Текст уведомления, подтверждённый через MCP-браузер (DEVAPR-11722)
const FOREIGN_KR_NOTICE_TEXT =
  "Владелец ключевого результата не из вашей команды";

test.describe(
  "Утверждение целей — уведомление о чужом ответственном КР",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: adminEmail, password: adminPassword } =
        getCredentials("admin");
      await adminApi.signIn(adminEmail, adminPassword);

      // Сохраняем начальное состояние настройки утверждения
      const { data: settingsData } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение целей
      const { response: enableResp } = await adminApi.setApprovalEnabled(true);
      if (!enableResp.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${enableResp.status()}`,
        );
      }

      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();
      const uniqueId = Date.now();

      // ──────────────────────────────────────────────────────────────────────
      // ЦЕЛЬ 1: user создаёт цель с КР на себя → отправляет на утверждение
      // Admin смотрит цель — user НЕ из прямых подчинённых admin → нотис виден
      // ──────────────────────────────────────────────────────────────────────
      const userApi = new ObjectivesAPI(request);
      const { email: userEmail, password: userPassword } =
        getCredentials("user");
      await userApi.signIn(userEmail, userPassword);

      const userId = userApi.getCurrentUserId();
      if (!userId) {
        throw new Error(
          "Не удалось получить userId пользователя (user) после signIn — проверь credentials",
        );
      }

      const { response: createUserResp, data: createUserData } =
        await userApi.saveObjective({
          title: `[FKRN] Цель с чужим КР для нотиса ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: userId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-fkrn-foreign-${uniqueId}`,
              title: `КР с чужим ответственным ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: userId,
            },
          ],
        });

      if (!createUserResp.ok()) {
        throw new Error(
          `Не удалось создать цель user'а через API: ${createUserResp.status()} ${JSON.stringify(createUserData)}`,
        );
      }

      foreignKrObjectiveId = createUserData?.id;
      if (!foreignKrObjectiveId) {
        throw new Error(
          `API не вернул ID цели user'а. Ответ: ${JSON.stringify(createUserData)}`,
        );
      }

      const { response: sendUserResp } =
        await userApi.sendForApproval(foreignKrObjectiveId);
      if (!sendUserResp.ok()) {
        throw new Error(
          `Не удалось отправить цель user'а на утверждение: ${sendUserResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Цель user'а (foreignKR) id=${foreignKrObjectiveId} userId=${userId} создана и отправлена на утверждение`,
      );

      // ──────────────────────────────────────────────────────────────────────
      // ЦЕЛЬ 2: admin создаёт цель с КР на себя → отправляет на утверждение
      // Admin смотрит цель — КР ответственный = сам admin → нотис НЕ виден
      // ──────────────────────────────────────────────────────────────────────
      const adminId = adminApi.getCurrentUserId();
      if (!adminId) {
        throw new Error(
          "Не удалось получить userId администратора после signIn — проверь credentials",
        );
      }

      const { response: createAdminResp, data: createAdminData } =
        await adminApi.saveObjective({
          title: `[FKRN] Цель admin со своим КР без нотиса ${uniqueId}`,
          startDate,
          endDate,
          status: "active",
          level: "self",
          responsibleUserId: adminId,
          userAccessType: "everybody",
          milestones: [
            {
              temporaryId: `temp-fkrn-own-${uniqueId}`,
              title: `КР admin на себя ${uniqueId}`,
              type: "percent",
              weight: 1,
              progress: 0,
              responsibleUserId: adminId,
            },
          ],
        });

      if (!createAdminResp.ok()) {
        throw new Error(
          `Не удалось создать цель admin'а через API: ${createAdminResp.status()} ${JSON.stringify(createAdminData)}`,
        );
      }

      ownKrObjectiveId = createAdminData?.id;
      if (!ownKrObjectiveId) {
        throw new Error(
          `API не вернул ID цели admin'а. Ответ: ${JSON.stringify(createAdminData)}`,
        );
      }

      const { response: sendAdminResp } =
        await adminApi.sendForApproval(ownKrObjectiveId);
      if (!sendAdminResp.ok()) {
        throw new Error(
          `Не удалось отправить цель admin'а на утверждение: ${sendAdminResp.status()}`,
        );
      }

      console.log(
        `[beforeAll] Цель admin'а (ownKR) id=${ownKrObjectiveId} adminId=${adminId} создана и отправлена на утверждение`,
      );
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      if (foreignKrObjectiveId) {
        await adminApi.deleteObjective(foreignKrObjectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель foreignKR ${foreignKrObjectiveId}: ${e.message}`,
          );
        });
        foreignKrObjectiveId = null;
      }

      if (ownKrObjectiveId) {
        await adminApi.deleteObjective(ownKrObjectiveId).catch((e) => {
          console.warn(
            `[afterAll] Не удалось удалить цель ownKR ${ownKrObjectiveId}: ${e.message}`,
          );
        });
        ownKrObjectiveId = null;
      }

      if (initialApprovalEnabled !== null) {
        await adminApi.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // ТЕСТ 1 (позитивный): уведомление видно, когда КР ответственный — не из команды
    // ──────────────────────────────────────────────────────────────────────────
    test("C8289: Уведомление о чужом КР видно при утверждении цели с ответственным не из команды",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");

        if (!foreignKrObjectiveId) {
          throw new Error(
            "foreignKrObjectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели user'а под admin (КР — user, не из команды admin)",
          async () => {
            await detailsPage.goto(foreignKrObjectiveId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await detailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          "Проверить: уведомление о чужом КР видно на странице",
          async () => {
            const notice = page.getByText(FOREIGN_KR_NOTICE_TEXT);
            await notice.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await expect(
              notice,
              `Уведомление "${FOREIGN_KR_NOTICE_TEXT}" должно быть видно, когда КР ответственный не из команды`,
            ).toBeVisible();
          },
        );
      },
    );

    // ──────────────────────────────────────────────────────────────────────────
    // ТЕСТ 2 (негативный): уведомление НЕ видно, когда КР ответственный — сам admin
    // ──────────────────────────────────────────────────────────────────────────
    test("C8290: Уведомление о чужом КР не отображается когда ответственный — из команды",
      { tag: ["@regression"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        if (!ownKrObjectiveId) {
          throw new Error(
            "ownKrObjectiveId не установлен — beforeAll не выполнен или завершился с ошибкой",
          );
        }

        const detailsPage = new ObjectiveDetailsPage(page, testInfo);

        await test.step(
          "Открыть страницу деталей цели admin'а под admin (КР — сам admin)",
          async () => {
            await detailsPage.goto(ownKrObjectiveId);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step('Проверить что статус цели = "На утверждении"', async () => {
          await detailsPage.assertApprovalStatus("На утверждении");
        });

        await test.step(
          "Проверить: уведомление о чужом КР НЕ отображается",
          async () => {
            const notice = page.getByText(FOREIGN_KR_NOTICE_TEXT);
            const isVisible = await notice
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            expect(
              isVisible,
              `Уведомление "${FOREIGN_KR_NOTICE_TEXT}" НЕ должно отображаться, когда КР ответственный — из команды`,
            ).toBe(false);
          },
        );
      },
    );
  },
);
