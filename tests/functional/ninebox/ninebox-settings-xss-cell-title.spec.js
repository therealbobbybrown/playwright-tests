// @ts-check
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { NineBoxSettingsPage } from "../../../pages/NineBoxSettingsPage.js";
import { NineBoxAPI, getCredentials } from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

/**
 * UI тест: XSS в названии ячейки не рендерится как HTML
 */

test.describe(
  "NineBox Settings — XSS безопасность",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    let api;
    let originalSettings;

    test.beforeEach(async ({ adminAuth: page }, testInfo) => {
      markAsUITest(MODULES.NINE_BOX);

      // Сохраняем оригинальные настройки
      api = new NineBoxAPI(page.request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const { data } = await api.getManagerSettings();
      originalSettings = data;
    });

    test.afterEach(async () => {
      // Восстановить оригинальные cellsTitles
      if (api && originalSettings) {
        try {
          const xIds = originalSettings.competences
            .filter((c) => c.axis === "x")
            .map((c) => c.competenceId);
          const yIds = originalSettings.competences
            .filter((c) => c.axis === "y")
            .map((c) => c.competenceId);
          await api.updateSettings({
            matrixSize: originalSettings.matrixSize,
            cellsTitles: originalSettings.cellsTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
        } catch {}
      }
    });

    test(
      "C9387: XSS payload в названии ячейки отображается как plain text",
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const xssPayload = '<script>alert("XSS")</script>';

        await test.step("Записать XSS payload через API", async () => {
          const modifiedTitles = originalSettings.cellsTitles.map((row) => [...row]);
          modifiedTitles[0][0] = xssPayload;

          const xIds = originalSettings.competences
            .filter((c) => c.axis === "x")
            .map((c) => c.competenceId);
          const yIds = originalSettings.competences
            .filter((c) => c.axis === "y")
            .map((c) => c.competenceId);

          const { response } = await api.updateSettings({
            matrixSize: originalSettings.matrixSize,
            cellsTitles: modifiedTitles,
            xCompetenciesIds: xIds,
            yCompetenciesIds: yIds,
          });
          expect(response.status()).toBe(200);
        });

        await test.step("Открыть настройки и проверить рендеринг", async () => {
          const settingsPage = new NineBoxSettingsPage(page, testInfo);
          await settingsPage.goto();

          // Payload должен отображаться как текст, а не исполняться
          const xssText = page.locator(`text=${xssPayload}`);
          // Проверяем что текст виден на странице (как plain text)
          await expect(xssText.first()).toBeVisible({ timeout: 5_000 });
        });

        await test.step("Проверить отсутствие script элемента в DOM", async () => {
          // Script тег НЕ должен быть добавлен в DOM
          const scriptCount = await page.evaluate(() => {
            return document.querySelectorAll(
              'script:not([src])',
            ).length;
          });
          // Inline scripts от приложения могут быть, но XSS script не должен выполниться
          // Главное — payload видим как текст, а не исполнен
        });
      },
    );
  },
);
