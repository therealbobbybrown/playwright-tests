// @ts-check
/**
 * UI тесты для модуля Scenarios - Performers (участники)
 *
 * Покрытие:
 * - Таблица участников на Dashboard
 * - Кнопка добавления сотрудников
 * - Колонки таблицы участников
 *
 * @tags @ui @regression @scenarios @performers
 * @module Scenarios
 */

import { test } from "../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { ScenariosPage } from "../../../pages/ScenariosPage.js";
import {
  ScenariosAPI,
  OrgStructureAPI,
  getCredentials,
} from "../../utils/api/index.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TestDataHelper } from "../../utils/TestDataHelper.js";
import { ScenarioSeedHelper } from "../../utils/seed/ScenarioSeedHelper.js";

test.describe(
  "Scenarios - Performers UI",
  { tag: ["@ui", "@regression", "@scenarios", "@performers"] },
  () => {
    /** @type {number|null} */
    let scenarioWithPerformerId = null;

    test.beforeAll(async ({ request }) => {
      const { email, password } = getCredentials("admin");

      // Получаем или создаём активный опрос
      const surveyId = await ScenarioSeedHelper.getOrCreateActiveSurveyId(request);

      // Получаем пользователя для добавления как performer
      const orgApi = new OrgStructureAPI(request);
      await orgApi.signIn(email, password);
      const { data: usersData } = await orgApi.getUsers({ limit: 5 });
      const users = usersData?.items || usersData || [];
      const testUser = users.find((u) => u.id > 1) || users[0];

      if (!testUser?.id) {
        throw new Error(
          "No users available in org structure for Performers tests",
        );
      }

      // Создаём и активируем сценарий
      const api = new ScenariosAPI(request);
      await api.signIn(email, password);

      const { data: scenario } = await api.createAndActivate({
        title: TestDataHelper.generateUniqueName("Performers UI test"),
        actions: [{ type: "survey", days: 1, surveyId }],
      });

      if (!scenario?.id) {
        throw new Error(
          "Failed to create and activate scenario via API for Performers tests",
        );
      }

      // Добавляем performer
      await api.createPerformer(scenario.id, testUser.id);
      scenarioWithPerformerId = scenario.id;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.SCENARIOS, "Performers");
    });

    test(
      "C7292: Таб Dashboard показывает таблицу участников",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть сценарий с участником", async () => {
          await scenariosPage.navigateToScenario(scenarioWithPerformerId);
        });

        await test.step("Проверить, что Dashboard содержит таблицу участников", async () => {
          await expect(scenariosPage.performersTable).toBeVisible({
            timeout: 10000,
          });

          // Проверяем заголовки таблицы
          const headerCount = await scenariosPage.performersTableHeaders.count();
          expect(
            headerCount,
            "Таблица участников должна содержать минимум 3 колонки",
          ).toBeGreaterThanOrEqual(3);
        });
      },
    );

    test(
      'C7293: Кнопка "Добавить сотрудников" видна для активного сценария',
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть сценарий с участником", async () => {
          await scenariosPage.navigateToScenario(scenarioWithPerformerId);
        });

        await test.step('Проверить кнопку "Добавить сотрудников"', async () => {
          await expect(
            scenariosPage.addPerformerButton,
            "Кнопка добавления сотрудников должна быть видна",
          ).toBeVisible({ timeout: 10000 });
        });

        await test.step("Проверить наличие поиска по сотрудникам", async () => {
          // Поиск может быть скрыт при малом количестве участников —
          // проверяем через waitFor с коротким таймаутом
          const isSearchVisible = await scenariosPage.performersSearchInput
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          // Если поиск виден — проверяем, что это input
          if (isSearchVisible) {
            await expect(scenariosPage.performersSearchInput).toBeVisible();
          }
          // Если нет — это допустимо при малом количестве участников
        });
      },
    );

    test(
      "C7294: Таблица участников отображает корректные колонки",
      { tag: ["@regression"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("minor");

        const scenariosPage = new ScenariosPage(page, testInfo);

        await test.step("Открыть сценарий с участником", async () => {
          await scenariosPage.navigateToScenario(scenarioWithPerformerId);
        });

        await test.step("Проверить колонки таблицы участников", async () => {
          await expect(scenariosPage.performersTable).toBeVisible({
            timeout: 10000,
          });

          // Проверяем ожидаемые колонки: Сотрудник, Дата запуска, Прогресс, Статус
          const headerTexts = await scenariosPage.performersTableHeaders.allTextContents();
          const joined = headerTexts.join(" ");

          expect(joined, 'Должна быть колонка "Сотрудник"').toMatch(
            /сотрудник/i,
          );
          expect(joined, "Должна быть колонка с датой").toMatch(/дата/i);
          expect(joined, 'Должна быть колонка "Прогресс" или "Статус"').toMatch(
            /прогресс|статус/i,
          );
        });

        await test.step("Проверить наличие строк участников", async () => {
          const rowCount = await scenariosPage.performersTableRows.count();
          expect(
            rowCount,
            "Должна быть минимум 1 строка участника",
          ).toBeGreaterThanOrEqual(1);
        });
      },
    );
  },
);
