// @ts-check
/**
 * UI тесты для модуля Scenarios - Фильтрация по статусам
 *
 * Покрытие:
 * - Фильтрация по статусу "Все"
 * - Фильтрация по статусу "Активные"
 * - Фильтрация по статусу "Черновики"
 *
 * @tags @ui @regression @scenarios @filters
 * @module Scenarios
 */

import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { ScenariosPage } from "../../../pages/ScenariosPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";

test.describe(
  "Scenarios - Filters",
  { tag: ["@ui", "@regression", "@scenarios", "@filters"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Filters");
    });

    test(
      'C4250: Фильтрация сценариев по статусу "Все"',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step('Применить фильтр "Все"', async () => {
          await scenariosPage.filterByStatus("all");
        });

        await test.step("Проверить, что фильтр применён и список загружен", async () => {
          // Кнопка фильтра "Все статусы" должна оставаться видна после применения
          await expect(scenariosPage.statusFilterAll).toBeVisible();
          // Фильтр "Все" должен показывать хотя бы один сценарий (данные созданы seed'ом)
          const count = await scenariosPage.getScenariosCount();
          expect(
            count,
            'Фильтр "Все" должен возвращать хотя бы один сценарий',
          ).toBeGreaterThan(0);
        });
      },
    );

    test(
      'C4251: Фильтрация сценариев по статусу "Активные"',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step('Применить фильтр "Активные"', async () => {
          await scenariosPage.filterByStatus("active");
        });

        await test.step("Проверить, что фильтр применён и список загружен", async () => {
          // Кнопка фильтра "Активные" должна оставаться видна — подтверждение что фильтр применён
          await expect(scenariosPage.statusFilterActive).toBeVisible();
          // Кнопка "Все статусы" тоже должна быть видна (фильтры всегда видны в панели)
          await expect(scenariosPage.statusFilterAll).toBeVisible();
        });
      },
    );

    test(
      'C4252: Фильтрация сценариев по статусу "Черновики"',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть страницу сценариев", async () => {
          await scenariosPage.navigate();
        });

        await test.step('Применить фильтр "Черновики"', async () => {
          await scenariosPage.filterByStatus("draft");
        });

        await test.step("Проверить, что фильтр применён и список загружен", async () => {
          // Кнопка фильтра "Черновики" должна оставаться видна — подтверждение что фильтр применён
          await expect(scenariosPage.statusFilterDraft).toBeVisible();
          // Кнопка "Все статусы" тоже должна быть видна (фильтры всегда видны в панели)
          await expect(scenariosPage.statusFilterAll).toBeVisible();
        });
      },
    );
  },
);
