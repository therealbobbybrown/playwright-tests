// tests/functional/development-plans/dev-plan-create-smoke.spec.js
// TestRail: C2702 - Создание плана развития (smoke)
// UI-001: Базовый smoke тест создания плана развития с обязательными полями

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { DevelopmentPlanCreatePage } from "../../../pages/DevelopmentPlanCreatePage.js";
import { DevelopmentPlanDetailsPage } from "../../../pages/DevelopmentPlanDetailsPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Создание плана развития",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2702: создать план развития с обязательными полями",
      { tag: ["@smoke", "@critical"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("critical");

        // Page Objects
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        // Тестовые данные
        const planGoal = `Тест план развития ${Date.now()}`;
        let createdPlanId = null;

        // API клиент для cleanup
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        try {
          // Шаг 1: Перейти в модуль Развитие → Планы развития
          await test.step('Перейти в модуль "Развитие" → "Планы развития"', async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();

            // Проверка: страница открылась, есть кнопка создания
            await expect(plansPage.createButton).toBeVisible({
              timeout: TIMEOUTS.MEDIUM,
            });
          });

          // Шаг 2: Нажать "Создать план развития"
          await test.step('Нажать "Создать план развития"', async () => {
            await plansPage.clickCreatePlan();

            // Проверяем появился ли popup выбора типа плана
            const newPlanVisible = await plansPage.newPlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (newPlanVisible) {
              // Если popup появился - выбираем "Новый план развития"
              await plansPage.selectNewPlan();
            }
            // Если popup не появился - форма создания открывается напрямую

            await createPage.assertOpened();
          });

          // Шаг 3: Проверить начальное состояние формы
          await test.step("Проверить начальное состояние формы создания", async () => {
            // Поле "Цель" должно быть пустым
            await expect(createPage.goalInput).toHaveValue("", {
              timeout: TIMEOUTS.MEDIUM,
            });

            // Кнопка "Создать" должна быть заблокирована (обязательные поля не заполнены)
            await expect(createPage.createButton).toBeDisabled({
              timeout: TIMEOUTS.MEDIUM,
            });
          });

          // Шаг 4: Заполнить обязательные поля
          await test.step("Заполнить цель плана развития", async () => {
            await createPage.fillGoal(planGoal);

            // Проверка: значение введено (auto-retry)
            await expect(createPage.goalInput).toHaveValue(planGoal, {
              timeout: TIMEOUTS.MEDIUM,
            });
          });

          // Шаг 5: Выбрать сотрудника
          await test.step("Выбрать сотрудника", async () => {
            await createPage.selectFirstEmployee();

            // Проверка: кнопка "Выберите сотрудника" должна исчезнуть (заменена на выбранного)
            await expect(
              page.getByRole("button", { name: /Выберите сотрудника/i }),
            ).not.toBeVisible({ timeout: TIMEOUTS.MEDIUM });
          });

          // Шаг 6: Создать план
          await test.step('Нажать "Создать"', async () => {
            await createPage.clickCreate();

            // Проверка: произошёл переход на страницу деталей плана
            await expect(page).toHaveURL(/\/development-plans\/\d+/, {
              timeout: TIMEOUTS.PAGE_LOAD,
            });
          });

          // Шаг 7: Проверить успешное создание
          await test.step("Проверить, что план создан и открылась страница деталей", async () => {
            await detailsPage.assertOpened();

            // Извлекаем ID плана из URL для cleanup
            const url = page.url();
            const match = url.match(/\/development-plans\/(\d+)/);
            expect(match, "ID плана должен быть в URL").not.toBeNull();
            createdPlanId = parseInt(match[1], 10);
            console.log(`План создан с ID: ${createdPlanId}`);

            // Проверка: цель плана соответствует введённой
            const displayedGoal = await detailsPage.getGoalText();
            expect(displayedGoal).toContain(planGoal);
          });

          // Шаг 8: Проверить план в списке
          await test.step("Проверить, что план отображается в списке планов", async () => {
            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();

            const planRow = await plansPage.findPlanByName(planGoal);
            expect(planRow).not.toBeNull();
          });
        } finally {
          // Cleanup: удаляем созданный план через API
          if (createdPlanId) {
            await test.step("Cleanup: удалить созданный план через API", async () => {
              try {
                const { response } =
                  await api.deleteDevelopmentPlan(createdPlanId);
                if (response.ok()) {
                  console.log(`План ${createdPlanId} успешно удалён`);
                } else {
                  console.warn(
                    `Не удалось удалить план ${createdPlanId}: ${response.status()}`,
                  );
                }
              } catch (error) {
                console.warn(`Ошибка при удалении плана: ${error.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C3542: Нельзя создать план без обязательных полей",
      { tag: ["@regression", "@negative"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);

        // Шаг 1: Перейти к созданию плана
        await test.step("Перейти к созданию плана развития", async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
          await plansPage.clickCreatePlan();

          const newPlanVisible = await plansPage.newPlanOption
            .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
            .then(() => true)
            .catch(() => false);

          if (newPlanVisible) {
            await plansPage.selectNewPlan();
          }

          await createPage.assertOpened();
        });

        // Шаг 2: Кнопка "Создать" заблокирована без обязательных полей
        await test.step('Кнопка "Создать" заблокирована без заполнения обязательных полей', async () => {
          await expect(createPage.createButton).toBeDisabled({
            timeout: TIMEOUTS.MEDIUM,
          });
        });

        // Шаг 3: Заполнить только пробелы — кнопка остаётся заблокирована
        await test.step("Заполнить поле цели только пробелами — кнопка остаётся заблокирована", async () => {
          await createPage.goalInput.fill("   ");
          await createPage.goalInput.blur();

          await expect(createPage.createButton).toBeDisabled({
            timeout: TIMEOUTS.MEDIUM,
          });
        });
      },
    );
  },
);
