// tests/functional/objectives/objective-approval-settings-disable-popup.spec.js
// TestRail: C-APPROVAL-DISABLE-01
// При выключении тогла утверждения целей должно появляться модальное окно подтверждения
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
  "Утверждение целей — попап подтверждения при выключении",
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

      // Включаем утверждение, чтобы тогл был в состоянии ON перед тестом
      const { response } = await api.setApprovalEnabled(true);
      if (!response.ok()) {
        throw new Error(
          `Не удалось включить утверждение целей: ${response.status()}`,
        );
      }
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
    });

    test("C8303: При клике на тогл выключения утверждения появляется попап подтверждения",
      { tag: ["@critical", "@approval-toggle"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        let nativeDialogAppeared = false;

        await test.step("Открыть настройки целей", async () => {
          await page.goto("/ru/objectives/settings/");
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG })
            .catch(() => {});
          await expect(
            page.getByRole("heading", { name: /Настройки целей/i }),
          ).toBeVisible({ timeout: TIMEOUTS.ELEMENT_VISIBLE });
        });

        await test.step("Убедиться что тогл утверждения включён (checked)", async () => {
          const checkbox = page.getByRole("checkbox");
          await expect(checkbox).toBeChecked();
        });

        await test.step(
          "Настроить перехват native dialog (beforeunload / confirm)",
          async () => {
            page.on("dialog", (dialog) => {
              nativeDialogAppeared = true;
              // Отклоняем диалог — остаёмся на странице, тогл должен оставаться включённым
              dialog.dismiss();
            });
          },
        );

        await test.step(
          "Кликнуть на тогл утверждения для выключения",
          async () => {
            const checkbox = page.getByRole("checkbox");
            await checkbox.click();
            // Даём время на появление dialog/модалки
            await page.waitForTimeout(TIMEOUTS.SMALL);
          },
        );

        await test.step(
          "Проверить что появился попап подтверждения (native dialog или кастомная модалка)",
          async () => {
            if (nativeDialogAppeared) {
              // Native confirm/beforeunload был перехвачен и отклонён — всё ОК
              expect(
                nativeDialogAppeared,
                "Native dialog подтверждения должен был появиться при попытке выключить утверждение",
              ).toBe(true);
              return;
            }

            // Проверяем кастомную модалку (role=dialog или alertdialog)
            const customModal = page
              .getByRole("dialog")
              .or(page.getByRole("alertdialog"));
            const modalVisible = await customModal
              .first()
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (modalVisible) {
              // Проверяем что модалка содержит текст подтверждения отключения
              const modalContent = customModal.first();
              const hasConfirmText = await modalContent
                .getByText(/выключить|отключить|подтвердить|confirm/i)
                .first()
                .isVisible()
                .catch(() => false);
              expect(
                hasConfirmText,
                "Модалка должна содержать текст подтверждения выключения утверждения",
              ).toBe(true);
            } else {
              // Ни native dialog, ни кастомная модалка не появились
              throw new Error(
                "Попап подтверждения не появился при попытке выключить утверждение целей. " +
                  "По брифу: 'Отключение необходимо подтвердить, поэтому показываем модальное окно с подтверждением'",
              );
            }
          },
        );

        await test.step(
          "Закрыть попап (отмена) — тогл должен остаться включённым",
          async () => {
            if (nativeDialogAppeared) {
              // Native dialog уже был отклонён (dismiss) в обработчике
              // Тогл должен остаться checked
              const checkbox = page.getByRole("checkbox");
              await expect(checkbox).toBeChecked();
              return;
            }

            // Для кастомной модалки — нажимаем кнопку отмены/закрытия
            const cancelBtn = page
              .getByRole("dialog")
              .getByRole("button", { name: /отмена|cancel|нет|закрыть/i })
              .or(
                page
                  .getByRole("alertdialog")
                  .getByRole("button", {
                    name: /отмена|cancel|нет|закрыть/i,
                  }),
              )
              .first();

            const hasCancelBtn = await cancelBtn
              .isVisible()
              .catch(() => false);

            if (hasCancelBtn) {
              await cancelBtn.click();
            } else {
              // Fallback: закрыть по Escape
              await page.keyboard.press("Escape");
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            // Тогл должен остаться в состоянии ON
            const checkbox = page.getByRole("checkbox");
            await expect(
              checkbox,
              "После отмены попапа тогл утверждения должен остаться включённым",
            ).toBeChecked();
          },
        );

        await test.step(
          "Убедиться что осталось на странице настроек (не было навигации)",
          async () => {
            await expect(page).toHaveURL(/\/objectives\/settings\//);
          },
        );
      },
    );
  },
);
