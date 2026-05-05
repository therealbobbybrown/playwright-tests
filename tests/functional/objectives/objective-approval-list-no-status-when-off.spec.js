// tests/functional/objectives/objective-approval-list-no-status-when-off.spec.js
// TestRail: C-APPROVAL-LIST-02 — Колонка "Статус" скрыта при выключенном утверждении
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

test.describe(
  "Утверждение целей — колонка «Статус» скрыта при выключенном утверждении",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
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

      // Выключаем утверждение целей
      const { response: disableResp } = await api.setApprovalEnabled(false);
      if (!disableResp.ok()) {
        throw new Error(
          `Не удалось выключить утверждение целей: ${disableResp.status()}`,
        );
      }

      console.log("[beforeAll] Утверждение целей отключено");
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

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

    test("C8292: Колонка «Статус» скрыта при выключенном утверждении",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        const objectivesPage = new ObjectivesAllPage(page);

        await test.step("Открыть список целей", async () => {
          await page.goto("/ru/objectives/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await objectivesPage.assertOpened();
        });

        await test.step(
          'Проверить что колонка "Статус" отсутствует (toHaveCount(0))',
          async () => {
            await objectivesPage.assertStatusColumnHidden();
          },
        );

        await test.step(
          'Проверить что фильтр "Статус" отсутствует',
          async () => {
            await objectivesPage.assertStatusFilterHidden();
          },
        );
      },
    );
  },
);
