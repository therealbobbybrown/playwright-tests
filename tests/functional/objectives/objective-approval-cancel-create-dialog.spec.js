// tests/functional/objectives/objective-approval-cancel-create-dialog.spec.js
// TestRail: C-APPROVAL-CANCEL-01, C-APPROVAL-CANCEL-02
// Попап подтверждения при отмене создания цели (beforeunload dialog)
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
// Цели, созданные автосохранением при вводе title — нужно удалить
const createdObjectiveIds = [];

test.describe(
  "Утверждение целей — попап при отмене создания",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
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

      await api.setApprovalEnabled(true);
    });

    test.afterAll(async ({ request }) => {
      const api = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      // Удаляем цели, созданные автосохранением
      for (const id of createdObjectiveIds) {
        await api.deleteObjective(id).catch(() => {});
      }

      if (initialApprovalEnabled !== null) {
        await api.setApprovalEnabled(initialApprovalEnabled).catch(() => {});
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES);
      setSeverity("critical");
    });

    test("C8279: Попап подтверждения при отмене создания цели с изменениями",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        let dialogAppeared = false;
        let dialogMessage = "";

        await test.step("Открыть форму создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
          await expect(page.getByRole("heading", { name: /Создать цель/i })).toBeVisible();
        });

        await test.step("Ввести название цели", async () => {
          await page.getByRole("textbox", { name: "Новая цель" }).fill("Тест попапа отмены " + Date.now());
          // Ждём автосохранения — URL меняется на /edit/{id}/
          await page.waitForURL(/\/objectives\/edit\/\d+\//, { timeout: TIMEOUTS.MEDIUM }).catch(() => {});

          // Запоминаем ID для cleanup
          const url = page.url();
          const match = url.match(/\/edit\/(\d+)\//);
          if (match) {
            createdObjectiveIds.push(Number(match[1]));
          }
        });

        await test.step("Настроить перехват dialog", async () => {
          page.on("dialog", (dialog) => {
            dialogAppeared = true;
            dialogMessage = dialog.message();
            dialog.dismiss(); // Остаёмся на странице
          });
        });

        await test.step('Нажать "Отмена" — должен появиться beforeunload dialog', async () => {
          await page.getByRole("button", { name: "Отмена" }).click();
          // beforeunload dialog синхронный — если появился, уже обработан
          await page.waitForTimeout(500);
        });

        await test.step("Проверить что dialog появился", async () => {
          expect(dialogAppeared, "Должен появиться dialog подтверждения при отмене с изменениями").toBe(true);
        });

        await test.step("Проверить что остались на странице (dismiss = остаться)", async () => {
          await expect(page).toHaveURL(/\/objectives\/edit\/\d+\//);
        });
      },
    );

    test("C8280: Нет попапа при отмене создания пустой цели",
      { tag: ["@regression"] },
      async ({ adminAuth: page }) => {
        let dialogAppeared = false;

        await test.step("Открыть форму создания цели", async () => {
          await page.goto("/ru/objectives/new/add/");
          await page.waitForLoadState("networkidle", { timeout: TIMEOUTS.LONG }).catch(() => {});
          await expect(page.getByRole("heading", { name: /Создать цель/i })).toBeVisible();
        });

        await test.step("Настроить перехват dialog", async () => {
          page.on("dialog", (dialog) => {
            dialogAppeared = true;
            dialog.accept(); // Уходим
          });
        });

        await test.step('Нажать "Отмена" без изменений', async () => {
          await page.getByRole("button", { name: "Отмена" }).click();
          await page.waitForTimeout(500);
        });

        await test.step("Проверить что dialog НЕ появился (форма пустая)", async () => {
          expect(dialogAppeared, "Не должно быть dialog при отмене пустой формы").toBe(false);
        });

        await test.step("Проверить что ушли со страницы создания", async () => {
          await expect(page).not.toHaveURL(/\/objectives\/new\/add\//);
        });
      },
    );
  },
);
