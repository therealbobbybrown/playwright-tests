// tests/functional/objectives/objective-approval-translations.spec.js
// TestRail: C-APPROVAL-I18N-01, C-APPROVAL-I18N-02
// Проверка переводов: статусы утверждения на RU и EN локалях
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { ObjectivesAPI } from "../../utils/api/ObjectivesAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";

let objectiveId = null;
let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — переводы (i18n)",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email: ae, password: ap } = getCredentials("admin");
      await adminApi.signIn(ae, ap);

      const { data: settings } = await adminApi.getCompanySettings();
      initialApprovalEnabled =
        settings?.isObjectivesApprovalEnabled ??
        settings?.is_objectives_approval_enabled ??
        false;
      await adminApi.setApprovalEnabled(true);

      // Создаём цель в approvalWaiting для проверки статуса
      const userApi = new ObjectivesAPI(request);
      await userApi.signIn(getCredentials("user").email, getCredentials("user").password);
      const userId = userApi.getCurrentUserId();
      const { startDate, endDate } = ObjectivesAPI.getCurrentQuarterDates();

      const { data: obj } = await userApi.saveObjective({
        title: `i18n test ${Date.now()}`,
        startDate, endDate, status: "active", level: "self",
        responsibleUserId: userId, userAccessType: "everybody",
        milestones: [{ temporaryId: `t-i18n-${Date.now()}`, title: "KR", type: "percent", weight: 100, progress: 0, responsibleUserId: userId }],
      });
      objectiveId = obj.id;
      console.log(`[beforeAll] Цель id=${obj.id}`);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      await api.signIn(getCredentials("admin").email, getCredentials("admin").password);
      if (objectiveId) await api.deleteObjective(objectiveId).catch(() => {});
      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
    });

    test("C8311: RU локаль — статус отображается на русском",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Открыть цель на RU", async () => {
          await page.goto(`/ru/objectives/view/${objectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
        });

        await test.step('Проверить что статус отображается как "Требует утверждения" на русском', async () => {
          await expect(
            page.getByText("Требует утверждения"),
          ).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        });

        await test.step("Заголовок страницы на русском", async () => {
          await expect(
            page.getByText("Детали цели"),
          ).toBeVisible();
        });
      },
    );

    test("C8312: EN локаль — статус отображается на английском",
      { tag: ["@regression"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Открыть цель на EN", async () => {
          await page.goto(`/en/objectives/view/${objectiveId}/`);
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
        });

        await test.step("Русский текст статуса НЕ отображается", async () => {
          // На EN странице не должно быть русского текста "Требует утверждения"
          const ruText = page.getByText("Требует утверждения");
          await expect(ruText).toHaveCount(0);
        });

        await test.step("Английский текст статуса отображается", async () => {
          // Ожидаемые EN переводы: "Requires approval" / "Pending approval" / "Awaiting approval"
          const enStatus = page.getByText(/requires approval|pending approval|awaiting approval|approval waiting/i);
          await expect(enStatus.first()).toBeVisible({ timeout: TIMEOUTS.MEDIUM });
        });
      },
    );
  },
);
