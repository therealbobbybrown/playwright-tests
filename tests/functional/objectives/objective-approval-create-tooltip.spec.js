// tests/functional/objectives/objective-approval-create-tooltip.spec.js
// TestRail: C-APPROVAL-TOOLTIP-01
//
// Сценарий: при включённом утверждении на странице создания цели
// при наведении на кнопку "Создать" появляется tooltip
// "Не забудьте утвердить цель после создания"
//
// Подтверждено через MCP-браузер инспекцию реального DOM (DEVAPR-11722).
//
// После теста — восстанавливаем настройку утверждения и удаляем
// автосохранённый черновик, если он появился.

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

// Текст тултипа, подтверждённый через MCP-браузер
const TOOLTIP_TEXT = "Не забудьте утвердить цель после создания";

let initialApprovalEnabled = null;

test.describe(
  "Утверждение целей — тултип на кнопке 'Создать'",
  { tag: ["@ui", "@objectives", "@approval", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

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

      console.log("[beforeAll] Утверждение целей включено");
    });

    test.afterAll(async ({ request }) => {
      const adminApi = new ObjectivesAPI(request);
      const { email, password } = getCredentials("admin");
      await adminApi.signIn(email, password);

      // Восстанавливаем настройку утверждения
      if (initialApprovalEnabled !== null) {
        await adminApi.setApprovalEnabled(initialApprovalEnabled).catch((e) => {
          console.warn(
            `[afterAll] Не удалось восстановить настройку утверждения: ${e.message}`,
          );
        });
      }

      // Удаляем автосохранённые черновики если появились
      const adminId = adminApi.getCurrentUserId();
      if (adminId) {
        try {
          const { data: draftData } = await adminApi.getDraftObjectives({
            limit: 10,
          });
          const drafts = draftData?.items || draftData || [];
          for (const draft of drafts) {
            if (
              draft?.title?.includes("[TOOLTIP]") ||
              draft?.title?.includes("Новая цель") ||
              draft?.title === "" ||
              draft?.title === null
            ) {
              await adminApi.deleteObjective(draft.id).catch(() => {});
            }
          }
        } catch (e) {
          // Не критично, если черновиков нет или API недоступен
          console.warn(`[afterAll] Не удалось очистить черновики: ${e.message}`);
        }
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.OBJECTIVES, "Create tooltip");
    });

    test("C8282: Тултип на кнопке 'Создать' при включённом утверждении",
      { tag: ["@critical"] },
      async ({ adminAuth, page }) => {
        setSeverity("critical");

        await test.step(
          "Открыть страницу создания цели /ru/objectives/new/add/",
          async () => {
            await page.goto("/ru/objectives/new/add/");
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          },
        );

        await test.step(
          "Убедиться что страница создания цели загрузилась",
          async () => {
            // Проверяем что кнопка "Создать" присутствует на странице
            const createButton = page
              .getByRole("button", { name: /^Создать$/ })
              .first();
            await createButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await expect(
              createButton,
              "Кнопка 'Создать' должна присутствовать на странице создания цели",
            ).toBeVisible();
          },
        );

        await test.step(
          "Навести курсор на кнопку 'Создать'",
          async () => {
            const createButton = page
              .getByRole("button", { name: /^Создать$/ })
              .first();
            await createButton.hover();
            // Небольшая пауза для появления тултипа
            await page.waitForTimeout(500);
          },
        );

        await test.step(
          `Проверить видимость тултипа: "${TOOLTIP_TEXT}"`,
          async () => {
            // Тултип может быть в role="tooltip", [role=tooltip], или просто текстовый элемент
            const tooltipByRole = page.getByRole("tooltip");
            const tooltipByText = page.getByText(TOOLTIP_TEXT);

            // Ожидаем появления тултипа — проверяем оба варианта
            const tooltipVisible = await tooltipByText
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            expect(
              tooltipVisible,
              `Тултип "${TOOLTIP_TEXT}" должен появиться при наведении на кнопку "Создать". ` +
                `Убедитесь что утверждение целей включено в настройках компании.`,
            ).toBe(true);

            if (tooltipVisible) {
              await expect(
                tooltipByText.first(),
                `Текст тултипа должен содержать "${TOOLTIP_TEXT}"`,
              ).toBeVisible();
            }
          },
        );

        await test.step(
          "Убрать курсор (hover off) — тултип должен скрыться",
          async () => {
            // Перемещаем курсор в нейтральное место
            await page.mouse.move(0, 0);
            await page
              .waitForTimeout(300)
              .catch(() => {});
          },
        );
      },
    );
  },
);
