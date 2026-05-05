// @ts-check
import { test as fullTest, expect } from "../../fixtures/full.js";
import { ObjectivesAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsAPITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { assertSuccessStatus } from "../../utils/api/common-assertions.js";

/**
 * API тесты: Настройки утверждения целей (DEVAPR-11722)
 *
 * Покрытие:
 * - Включение/выключение утверждения через PATCH /manager/company/settings/
 * - Проверка GET /private/company/settings/ после изменения
 * - DB верификация isObjectivesApprovalEnabled
 * - Контроль доступа: user не может менять настройки
 * - Идемпотентность: повторное включение не ломает
 */

const test = fullTest.extend({
  adminAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
  userAPI: async ({ request }, use) => {
    const api = new ObjectivesAPI(request);
    const { email, password } = getCredentials("user");
    await api.signIn(email, password);
    await use(api);
  },
});

// Сохраняем начальное состояние для восстановления
let initialApprovalState = null;

test.describe(
  "Objectives Approval API — Settings",
  { tag: ["@api", "@objectives", "@approval", "@settings", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsAPITest(MODULES.OBJECTIVES, "Approval Settings");
    });

    test(
      "C8396: Включение утверждения целей через API",
      { tag: ["@critical", "@db"] },
      async ({ adminAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let settingsBeforeResponse, settingsBefore, enableResponse, settingsAfterResponse, settingsAfter;

        await test.step("Запомнить текущее состояние утверждения", async () => {
          const result = await adminAPI.getCompanySettings();
          settingsBeforeResponse = result.response;
          settingsBefore = result.data;
          assertSuccessStatus(settingsBeforeResponse);
          initialApprovalState = settingsBefore?.isObjectivesApprovalEnabled;
        });

        await test.step("PATCH /manager/company/settings/ — включить утверждение", async () => {
          const result = await adminAPI.setApprovalEnabled(true);
          enableResponse = result.response;
          assertSuccessStatus(enableResponse);
        });

        await test.step("GET /private/company/settings/ — проверить что включено", async () => {
          const result = await adminAPI.getCompanySettings();
          settingsAfterResponse = result.response;
          settingsAfter = result.data;
          assertSuccessStatus(settingsAfterResponse);
          expect(
            settingsAfter?.isObjectivesApprovalEnabled,
            "isObjectivesApprovalEnabled должен быть true/1 после включения",
          ).toBeTruthy();
        });

        await test.step("DB: Проверить isObjectivesApprovalEnabled = 1", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalEnabled(538, true);
        });
      },
    );

    test(
      "C8397: Выключение утверждения целей через API",
      { tag: ["@critical", "@db"] },
      async ({ adminAPI, objectivesVerifier }) => {
        setSeverity("critical");

        let disableResponse, settingsAfter;

        await test.step("Убедиться что утверждение включено", async () => {
          await adminAPI.setApprovalEnabled(true);
        });

        await test.step("PATCH /manager/company/settings/ — выключить утверждение", async () => {
          const result = await adminAPI.setApprovalEnabled(false);
          disableResponse = result.response;
          assertSuccessStatus(disableResponse);
        });

        await test.step("GET /private/company/settings/ — проверить что выключено", async () => {
          const result = await adminAPI.getCompanySettings();
          settingsAfter = result.data;
          expect(
            Number(settingsAfter?.isObjectivesApprovalEnabled),
            "isObjectivesApprovalEnabled должен быть 0 после выключения",
          ).toBe(0);
        });

        await test.step("DB: Проверить isObjectivesApprovalEnabled = 0", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalEnabled(538, false);
        });
      },
    );

    test(
      "C8398: User не может включить утверждение — 403",
      { tag: ["@critical"] },
      async ({ userAPI }) => {
        setSeverity("critical");

        let response;

        await test.step("User отправляет PATCH /manager/company/settings/ — ожидаем 403", async () => {
          const result = await userAPI.setApprovalEnabled(true);
          response = result.response;
        });

        await test.step("Проверить статус 403 Forbidden", async () => {
          expect(
            response.status(),
            "Обычный пользователь не должен иметь доступ к настройкам компании",
          ).toBe(403);
        });
      },
    );

    test(
      "C8399: Идемпотентность — повторное включение не ломает",
      { tag: ["@db"] },
      async ({ adminAPI, objectivesVerifier }) => {
        setSeverity("normal");

        let firstResponse, secondResponse, settings;

        await test.step("Включить утверждение первый раз", async () => {
          const result = await adminAPI.setApprovalEnabled(true);
          firstResponse = result.response;
          assertSuccessStatus(firstResponse);
        });

        await test.step("Включить утверждение повторно", async () => {
          const result = await adminAPI.setApprovalEnabled(true);
          secondResponse = result.response;
          assertSuccessStatus(secondResponse);
        });

        await test.step("Проверить что утверждение по-прежнему включено", async () => {
          const result = await adminAPI.getCompanySettings();
          settings = result.data;
          expect(settings?.isObjectivesApprovalEnabled).toBeTruthy();
        });

        await test.step("DB: Подтвердить состояние", async () => {
          if (!objectivesVerifier.isConnected()) return;
          await objectivesVerifier.verifyApprovalEnabled(538, true);
        });
      },
    );

    // Cleanup: восстановить начальное состояние
    test.afterAll(async ({ request }) => {
      if (initialApprovalState !== null) {
        const api = new ObjectivesAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        await api.setApprovalEnabled(!!initialApprovalState);
      }
    });
  },
);
