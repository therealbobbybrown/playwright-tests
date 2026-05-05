// tests/functional/development-plans/dev-plan-tasks-crud.spec.js
// TestRail: C2703, C2704, C2705, C2706 - CRUD целей развития в плане
// UI-003: Полный цикл работы с целями: создание, редактирование, завершение, удаление

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

test.describe(
  "CRUD целей развития в плане",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.slow();

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2703: добавить цель развития в план",
      { tag: ["@regression", "@critical"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("critical");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const planGoal = `План для тестирования целей ${Date.now()}`;
        const objectiveTitle = `Тестовая цель ${Date.now()}`;
        let createdPlanId = null;

        try {
          // Шаг 1: Создать план развития
          await test.step("Создать план развития", async () => {
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
            await createPage.fillGoal(planGoal);
            await createPage.selectFirstEmployee();
            await createPage.clickCreate();

            await page
              .waitForURL(/\/development-plans\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
            await detailsPage.assertOpened();

            const url = page.url();
            const match = url.match(/\/development-plans\/(\d+)/);
            if (match) {
              createdPlanId = parseInt(match[1], 10);
            }
          });

          // Шаг 2: Получить начальное количество целей
          let initialCount = 0;
          await test.step("Получить начальное количество целей", async () => {
            initialCount = await detailsPage.getActionsCount();
            console.log(`Начальное количество целей: ${initialCount}`);
          });

          // Шаг 3: Перейти на форму создания цели
          await test.step('Нажать "Создать цель развития"', async () => {
            await detailsPage.clickAddAction();
            // Должны быть на странице /objectives/add/
            expect(page.url()).toMatch(/objectives\/add/);
          });

          // Шаг 4: Заполнить и сохранить цель
          await test.step("Заполнить название цели и сохранить", async () => {
            await detailsPage.fillActionTitle(objectiveTitle);
            await detailsPage.saveAction();
          });

          // Шаг 5: Проверить что цель добавлена
          await test.step("Проверить, что цель добавлена", async () => {
            await detailsPage.assertOpened();
            const newCount = await detailsPage.getActionsCount();
            console.log(`Количество целей после добавления: ${newCount}`);
            expect(newCount).toBe(initialCount + 1);
          });

          // Шаг 6: Проверить название цели в таблице
          await test.step("Проверить название цели в таблице", async () => {
            // Ищем нашу цель среди строк таблицы (может быть не первой)
            const count = await detailsPage.getActionsCount();
            let found = false;
            for (let i = 0; i < count; i++) {
              const title = await detailsPage.getActionTitle(i);
              if (title.includes(objectiveTitle)) {
                found = true;
                break;
              }
            }
            expect(found).toBe(true);
          });

          // Шаг 7: Перезагрузить и проверить сохранение
          await test.step("Проверить сохранение после перезагрузки", async () => {
            await page.reload();
            await detailsPage.assertOpened();

            const countAfterReload = await detailsPage.getActionsCount();
            expect(countAfterReload).toBe(initialCount + 1);
          });
        } finally {
          if (createdPlanId) {
            await test.step("Cleanup: удалить тестовый план", async () => {
              try {
                await api.deleteDevelopmentPlan(createdPlanId);
                console.log(`План ${createdPlanId} удалён`);
              } catch (e) {
                console.warn(`Не удалось удалить план: ${e.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C2704: редактировать цель развития в плане",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const planGoal = `План для редактирования целей ${Date.now()}`;
        const originalTitle = `Цель оригинал ${Date.now()}`;
        const updatedTitle = `Цель обновлённая ${Date.now()}`;
        let createdPlanId = null;

        try {
          // Создать план и цель
          await test.step("Создать план с целью развития", async () => {
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
            await createPage.fillGoal(planGoal);
            await createPage.selectFirstEmployee();
            await createPage.clickCreate();

            await page
              .waitForURL(/\/development-plans\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
            await detailsPage.assertOpened();

            const url = page.url();
            const match = url.match(/\/development-plans\/(\d+)/);
            if (match) {
              createdPlanId = parseInt(match[1], 10);
            }
          });

          // Добавить цель
          await test.step("Добавить цель для редактирования", async () => {
            await detailsPage.clickAddAction();
            await detailsPage.fillActionTitle(originalTitle);
            await detailsPage.saveAction();

            await detailsPage.assertOpened();
            const count = await detailsPage.getActionsCount();
            expect(count).toBeGreaterThan(0);
          });

          // Открыть цель на редактирование через 3-dot меню
          await test.step("Открыть цель на редактирование", async () => {
            await detailsPage.openActionForEdit(0);
            expect(page.url()).toMatch(/objectives\/\d+/);
          });

          // Изменить название на странице "Изменить цель развития"
          await test.step("Изменить название цели", async () => {
            // Textbox с placeholder содержащим "Повысить уровень компетенции"
            const titleInput = page.getByRole("textbox").first();
            await titleInput.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await titleInput.clear();
            await titleInput.fill(updatedTitle);

            // Нажать "Сохранить"
            const saveBtn = page
              .getByRole("button", { name: "Сохранить", exact: true })
              .first();
            await saveBtn.click();

            // Ждём возврата на страницу плана
            await page.waitForURL(
              /\/development-plans\/\d+($|\?|\/(?!objectives))/,
              { timeout: TIMEOUTS.PAGE_LOAD },
            );
          });

          // Проверить изменения на странице плана
          await test.step("Проверить изменения на странице плана", async () => {
            await detailsPage.assertOpened();

            const count = await detailsPage.getActionsCount();
            let found = false;
            for (let i = 0; i < count; i++) {
              const title = await detailsPage.getActionTitle(i);
              if (title.includes(updatedTitle)) {
                found = true;
                break;
              }
            }
            expect(found).toBe(true);
          });
        } finally {
          if (createdPlanId) {
            await test.step("Cleanup: удалить план", async () => {
              try {
                await api.deleteDevelopmentPlan(createdPlanId);
              } catch (e) {
                console.warn(`Cleanup failed: ${e.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C7283: проверить прогресс цели в плане развития",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const startDate = new Date().toISOString().split("T")[0];
        const endDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
        let createdPlanId = null;

        try {
          // Создать план через API
          let responsibleUserId;
          await test.step("Создать план через API", async () => {
            const { data: listData } = await api.getDevelopmentPlans({
              limit: 5,
            });
            const items = listData?.items || listData || [];
            expect(
              items.length,
              "Требуется хотя бы один существующий план для получения responsibleUserId",
            ).toBeGreaterThanOrEqual(1);
            responsibleUserId =
              items[0].responsibleUserId || items[0].responsible_user_id;
            expect(responsibleUserId).toBeDefined();

            const { response, data } = await api.createDevelopmentPlan({
              title: `План для проверки прогресса ${Date.now()}`,
              responsibleUserId,
              startDate,
              endDate,
            });
            expect(response.ok()).toBe(true);
            createdPlanId = data.id;
            console.log(`План создан: ID=${createdPlanId}`);
          });

          // Создать цель через API
          await test.step("Создать цель развития через API", async () => {
            const { response } = await api.saveDevelopmentPlanObjective(
              createdPlanId,
              {
                title: `Цель для проверки прогресса ${Date.now()}`,
              },
            );
            console.log(
              `saveDevelopmentPlanObjective status: ${response.status()}`,
            );
          });

          // Открыть план в UI
          await test.step("Открыть план в браузере", async () => {
            const baseUrl = process.env.BASE_URL;
            await page.goto(
              new URL(`/ru/development-plans/${createdPlanId}/`, baseUrl).toString(),
              { waitUntil: "domcontentloaded" },
            );
            await detailsPage.assertOpened();
          });

          // Проверить что цель отображается
          await test.step("Проверить что цель отображается в таблице", async () => {
            const count = await detailsPage.getActionsCount();
            console.log(`Количество целей: ${count}`);
            expect(count).toBeGreaterThan(0);
          });

          // Проверить прогресс
          await test.step("Проверить прогресс цели", async () => {
            const progress = await detailsPage.getActionStatus(0);
            console.log(`Прогресс цели: "${progress}"`);
            // Прогресс должен содержать "0%" (цель без действий или с невыполненными)
            expect(progress).toMatch(/\d+%/);
          });

          // Проверить общий прогресс плана
          await test.step("Проверить общий прогресс плана", async () => {
            const progress = await detailsPage.getProgress();
            console.log(`Прогресс плана: ${progress}%`);
            expect(progress).toBeGreaterThanOrEqual(0);
          });
        } finally {
          if (createdPlanId) {
            await test.step("Cleanup: удалить план", async () => {
              try {
                await api.deleteDevelopmentPlan(createdPlanId);
              } catch (e) {
                console.warn(`Cleanup failed: ${e.message}`);
              }
            });
          }
        }
      },
    );

    test(
      "C2705: удалить цель из плана развития",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const planGoal = `План для удаления целей ${Date.now()}`;
        const objectiveTitle = `Цель для удаления ${Date.now()}`;
        let createdPlanId = null;

        try {
          // Создать план
          await test.step("Создать план развития", async () => {
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
            await createPage.fillGoal(planGoal);
            await createPage.selectFirstEmployee();
            await createPage.clickCreate();

            await page
              .waitForURL(/\/development-plans\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
            await detailsPage.assertOpened();

            const url = page.url();
            const match = url.match(/\/development-plans\/(\d+)/);
            if (match) {
              createdPlanId = parseInt(match[1], 10);
            }
          });

          // Добавить цель
          await test.step("Добавить цель для удаления", async () => {
            await detailsPage.clickAddAction();
            await detailsPage.fillActionTitle(objectiveTitle);
            await detailsPage.saveAction();

            await detailsPage.assertOpened();
          });

          // Получить количество до удаления
          let initialCount = 0;
          await test.step("Получить количество целей до удаления", async () => {
            initialCount = await detailsPage.getActionsCount();
            console.log(`Количество целей до удаления: ${initialCount}`);
            expect(initialCount).toBeGreaterThan(0);
          });

          // Удалить цель
          await test.step("Удалить цель", async () => {
            // Находим нужную цель и удаляем
            const count = await detailsPage.getActionsCount();
            let targetIndex = count - 1; // Последняя добавленная
            for (let i = 0; i < count; i++) {
              const title = await detailsPage.getActionTitle(i);
              if (title.includes(objectiveTitle)) {
                targetIndex = i;
                break;
              }
            }
            await detailsPage.deleteAction(targetIndex);
          });

          // Проверить что цель удалена
          await test.step("Проверить, что цель удалена", async () => {
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            const newCount = await detailsPage.getActionsCount();
            console.log(`Количество целей после удаления: ${newCount}`);
            expect(newCount).toBe(initialCount - 1);
          });

          // Перезагрузить и проверить
          await test.step("Проверить после перезагрузки", async () => {
            await page.reload();
            await detailsPage.assertOpened();

            const countAfterReload = await detailsPage.getActionsCount();
            expect(countAfterReload).toBe(initialCount - 1);
          });
        } finally {
          if (createdPlanId) {
            await test.step("Cleanup: удалить план", async () => {
              try {
                await api.deleteDevelopmentPlan(createdPlanId);
              } catch (e) {
                console.warn(`Cleanup failed: ${e.message}`);
              }
            });
          }
        }
      },
    );
  },
);
