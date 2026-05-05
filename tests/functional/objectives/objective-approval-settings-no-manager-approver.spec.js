// tests/functional/objectives/objective-approval-settings-no-manager-approver.spec.js
// TestRail: C-APPROVAL-NOMA-01
// APP_BUG: секция "Кто утверждает без руководителя" не появляется при включении утверждения
// По брифу: при включении тогла должен появиться селектор (калька с ИПР)
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

let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — настройка approver без руководителя",
  { tag: ["@ui", "@objectives", "@approval", "@approval-toggle", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: settingsData } = await api.getCompanySettings();
      initialApprovalEnabled =
        settingsData?.isObjectivesApprovalEnabled ??
        settingsData?.is_objectives_approval_enabled ??
        false;

      // Включаем утверждение
      await api.setApprovalEnabled(true);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
      setSeverity("critical");
    });

    // APP_BUG: секция не реализована на фронтенде (проверено MCP 2026-03-19)
    test('C8304: При включении утверждения появляется секция "Кто утверждает без руководителя"',
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        await test.step("Открыть настройки целей", async () => {
          await page.goto("/ru/objectives/settings/");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
          await expect(
            page.getByRole("heading", { name: /Настройки целей/i }),
          ).toBeVisible();
        });

        await test.step("Утверждение включено — checkbox checked", async () => {
          const checkbox = page.getByRole("checkbox");
          await expect(checkbox).toBeChecked();
        });

        await test.step('Проверить что секция "Кто утверждает цели без руководителя" отображается', async () => {
          // По брифу: "Кто утверждает цели если у сотрудника не указан руководитель"
          const approverSection = page.getByText(/кто утверждает.*руководитель/i)
            .or(page.getByText(/не указан руководитель/i))
            .or(page.getByText(/без руководителя/i));
          await expect(approverSection.first()).toBeVisible({ timeout: TIMEOUTS.SHORT });
        });

        await test.step("Проверить что по умолчанию выбран администратор спейса", async () => {
          // По брифу: "по умолчанию — администратор спейса"
          const defaultOption = page.getByText(/администратор/i)
            .or(page.getByText(/по умолчанию/i));
          await expect(defaultOption.first()).toBeVisible();
        });
      },
    );
  },
);
