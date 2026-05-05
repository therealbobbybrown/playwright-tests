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
 * UI тест: отображение матрицы 9-box на странице "Моя команда"
 * Требует: NineBox включён, login под manager
 */

test.describe(
  "NineBox матрица — Моя команда",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9330: Отобразить страницу Моя команда с данными оценки",
      { tag: ["@critical", "@smoke"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        await test.step("Убедиться что NineBox включён", async () => {
          const api = new NineBoxAPI(page.request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          const { data } = await api.getManagerSettings();
          if (!data.isEnabled) {
            await api.enable();
          }
        });

        await test.step('Открыть страницу "Моя команда"', async () => {
          await page.goto("/ru/dashboard/");
          await page.waitForLoadState("domcontentloaded");
          await page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
        });

        await test.step("Проверить заголовок страницы", async () => {
          const heading = page.getByRole("heading", {
            name: "Моя команда",
            level: 1,
          });
          await heading.waitFor({ state: "visible", timeout: 15_000 });
        });

        await test.step("Проверить наличие вкладок", async () => {
          const tabs = [
            "Оценка команды",
            "Распределение оценок",
            "Планы развития",
          ];
          for (const tab of tabs) {
            const tabBtn = page.getByRole("button", { name: tab });
            await expect(tabBtn).toBeVisible();
          }
        });
      },
    );
  },
);
