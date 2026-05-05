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
 * E2E тест: полный цикл настройка → включение → проверка матрицы
 */

test.describe(
  "NineBox E2E — полный цикл",
  { tag: ["@ui", "@ninebox", "@regression"] },
  () => {
    test.beforeEach(async ({}, testInfo) => {
      markAsUITest(MODULES.NINE_BOX);
    });

    test(
      "C9329: Полный цикл: настройка → включение → проверка API матрицы",
      { tag: ["@critical", "@smoke"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");

        const settingsPage = new NineBoxSettingsPage(page, testInfo);
        let wasEnabled = false;

        // Шаг 1: Открыть настройки
        await test.step("Открыть страницу настроек NineBox", async () => {
          await settingsPage.goto();
          await settingsPage.assertAllSectionsVisible();
        });

        // Шаг 2: Проверить что оси настроены
        await test.step("Проверить что оси содержат компетенции", async () => {
          const yComps = await settingsPage.getYAxisCompetencies();
          const xComps = await settingsPage.getXAxisCompetencies();

          expect(
            yComps.length,
            "Ось Y должна содержать хотя бы 1 компетенцию",
          ).toBeGreaterThan(0);
          expect(
            xComps.length,
            "Ось X должна содержать хотя бы 1 компетенцию",
          ).toBeGreaterThan(0);
        });

        // Шаг 3: Включить NineBox (если не включён)
        await test.step("Включить NineBox если не включён", async () => {
          wasEnabled = await settingsPage.isEnabled();
          if (!wasEnabled) {
            await settingsPage.enableNineBox();
          }
        });

        // Шаг 4: Проверить что API матрицы работает
        await test.step("Проверить матрицу через API", async () => {
          const api = new NineBoxAPI(page.request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { response, data } = await api.getManagerMatrix();
          expect(response.status(), "Матрица доступна (200)").toBe(200);
          expect(
            Array.isArray(data),
            "Ответ — 3D массив матрицы",
          ).toBe(true);
          expect(data.length, "Матрица 3x3").toBe(3);
        });

        // Шаг 5: Проверить поиск
        await test.step("Проверить поиск в матрице через API", async () => {
          const api = new NineBoxAPI(page.request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);

          const { response, data } = await api.searchManager({
            limit: 10,
            actualize: false,
          });
          expect(response.status()).toBe(200);
          expect(data).toHaveProperty("items");
          expect(data).toHaveProperty("total");
        });

        // Восстановить
        if (!wasEnabled) {
          const api = new NineBoxAPI(page.request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          await api.disable();
        }
      },
    );
  },
);
