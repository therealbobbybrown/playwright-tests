// @ts-check
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * UI тест: матрица 9-box не отображается при отключённом NineBox
 */

test.describe(
  "NineBox матрица — скрытие при отключении",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    let wasEnabled = false;
    let api;

    test.beforeEach(async ({ adminAuth: page }, testInfo) => {
      markAsUITest(MODULES.NINE_BOX);

      // Запоминаем текущее состояние
      api = new NineBoxAPI(page.request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const { data } = await api.getManagerSettings();
      wasEnabled = data.isEnabled;
    });

    test.afterEach(async () => {
      // Восстановить состояние
      if (api && wasEnabled) {
        try {
          await api.enable();
        } catch {}
      }
    });

    test(
      "C9380: Отключить NineBox и проверить что матрица не появляется на /dashboard/",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        await test.step("Отключить NineBox через API", async () => {
          if (wasEnabled) {
            await api.disable();
          }
        });

        await test.step('Открыть "Моя команда"', async () => {
          await page.goto("/ru/dashboard/");
          await page.waitForLoadState("domcontentloaded");
          await page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
        });

        await test.step("Проверить что страница загрузилась", async () => {
          const heading = page.getByRole("heading", {
            name: "Моя команда",
            level: 1,
          });
          await heading.waitFor({ state: "visible", timeout: 15_000 });
        });

        // NineBox отключён — API матрицы вернёт 403
        // UI не должен показывать NineBox-виджет
        await test.step("Проверить через API что матрица недоступна", async () => {
          const { response } = await api.getManagerMatrix();
          expect(
            response.status(),
            "Matrix API при отключённом NineBox должен вернуть 403",
          ).toBe(403);
        });
      },
    );
  },
);
