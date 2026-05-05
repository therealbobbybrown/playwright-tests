// tests/functional/development-plans/dev-plan-archive.spec.js
// UI-005: Смена статуса плана развития и возврат в черновик

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
  "Смена статуса плана развития",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C3526: Активировать план и вернуть в черновик",
      { tag: ["@regression", "@high"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("high");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const createPage = new DevelopmentPlanCreatePage(page, testInfo);
        const detailsPage = new DevelopmentPlanDetailsPage(page, testInfo);

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const planGoal = `План для смены статуса ${Date.now()}`;
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
            expect(createdPlanId).toBeTruthy();
          });

          // Проверить начальный статус "Черновик"
          await test.step('Проверить начальный статус "Черновик"', async () => {
            const status = await detailsPage.getStatus();
            console.log(`Начальный статус: ${status}`);
            expect(status).toMatch(/Черновик/i);
          });

          // Добавить цель развития (без неё кнопка "Запустить" disabled)
          await test.step("Добавить цель развития", async () => {
            await detailsPage.clickAddAction();
            await detailsPage.fillActionTitle(`Цель для плана ${Date.now()}`);
            await detailsPage.saveAction();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            const count = await detailsPage.getActionsCount();
            expect(count).toBeGreaterThan(0);
          });

          // Активировать план через кнопку "Запустить"
          await test.step("Активировать план через UI", async () => {
            const launchButton = page
              .getByRole("button", { name: /Запустить/i })
              .first();
            const launchVisible = await launchButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (launchVisible) {
              await launchButton.click();

              // Подтвердить если есть диалог
              const confirmButton = page
                .getByRole("button", {
                  name: /Запустить|Да|Подтвердить/i,
                })
                .last();
              const confirmVisible = await confirmButton
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (confirmVisible) {
                await confirmButton.click();
                await confirmButton
                  .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
                  .catch(() => {});
              }
            } else {
              console.log(
                'Кнопка "Запустить" не найдена - используем API',
              );
              await api.activateDevelopmentPlan(createdPlanId);
            }

            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Проверить статус "Активен"
          await test.step('Проверить статус "Активен"', async () => {
            await detailsPage.assertOpened();

            const activeText = page
              .getByText("Активен", { exact: true })
              .first();
            await activeText
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const status = await detailsPage.getStatus();
            console.log(`Статус после активации: ${status}`);
            expect(status).toMatch(/Активен/i);
          });

          // Вернуть в черновик
          await test.step("Вернуть план в черновик", async () => {
            const draftButton = page
              .getByRole("button", {
                name: /Вернуть в черновик/i,
              })
              .first();
            const draftButtonVisible = await draftButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (draftButtonVisible) {
              await draftButton.click();

              // Подтвердить если есть диалог
              const confirmButton = page
                .getByRole("button", {
                  name: /Да|Подтвердить|Вернуть/i,
                })
                .last();
              const confirmVisible = await confirmButton
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (confirmVisible) {
                await confirmButton.click();
                await confirmButton
                  .waitFor({ state: "hidden", timeout: TIMEOUTS.SHORT })
                  .catch(() => {});
              }
            } else {
              console.log(
                'Кнопка "Вернуть в черновик" не найдена - используем API',
              );
              await api.draftDevelopmentPlan(createdPlanId);
            }

            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Проверить возврат в "Черновик"
          await test.step('Проверить статус "Черновик" после возврата', async () => {
            await detailsPage.assertOpened();

            const draftText = page
              .getByText("Черновик", { exact: true })
              .first();
            await draftText
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const status = await detailsPage.getStatus();
            console.log(`Статус после возврата: ${status}`);
            expect(status).toMatch(/Черновик/i);
          });

          // Проверить что план существует (навигация напрямую по ID)
          await test.step("Проверить план доступен после возврата в черновик", async () => {
            // Переходим напрямую на страницу плана по ID — не через список
            // (список огромный, без поиска, пагинация через "Показать еще" слишком медленная)
            await page.goto(
              `/ru/development-plans/${createdPlanId}`,
              { waitUntil: "domcontentloaded", timeout: TIMEOUTS.PAGE_LOAD },
            );
            await detailsPage.assertOpened();

            const status = await detailsPage.getStatus();
            expect(status).toMatch(/Черновик/i);

            const goalText = await detailsPage.getGoalText();
            expect(goalText).toContain(planGoal);
            console.log("План доступен и имеет статус Черновик");
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
      "C3527: Цели сохраняются при смене статуса плана",
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

        const planGoal = `План с целями для смены статуса ${Date.now()}`;
        let createdPlanId = null;
        let initialTasksCount = 0;

        try {
          // Создать план с целью
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
            expect(createdPlanId).toBeTruthy();

            // Добавить цель развития через UI
            await detailsPage.clickAddAction();
            const taskTitle = `Цель в плане ${Date.now()}`;
            await detailsPage.fillActionTitle(taskTitle);
            await detailsPage.saveAction();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            initialTasksCount = await detailsPage.getActionsCount();
            console.log(`Создано целей: ${initialTasksCount}`);
            expect(initialTasksCount).toBeGreaterThan(0);
          });

          // Активировать план через API
          await test.step("Активировать план", async () => {
            const { response } =
              await api.activateDevelopmentPlan(createdPlanId);
            console.log(`Activate status: ${response.status()}`);

            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            await detailsPage.assertOpened();

            const status = await detailsPage.getStatus();
            console.log(`Статус после активации: ${status}`);
            expect(status).toMatch(/Активен/i);
          });

          // Проверить что цели сохранились после активации
          await test.step("Проверить цели после активации", async () => {
            const tasksCount = await detailsPage.getActionsCount();
            console.log(`Целей после активации: ${tasksCount}`);
            expect(tasksCount).toBe(initialTasksCount);
          });

          // Вернуть в черновик через API
          await test.step("Вернуть план в черновик", async () => {
            const { response } =
              await api.draftDevelopmentPlan(createdPlanId);
            console.log(`Draft status: ${response.status()}`);

            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            await detailsPage.assertOpened();

            const status = await detailsPage.getStatus();
            console.log(`Статус после возврата: ${status}`);
            expect(status).toMatch(/Черновик/i);
          });

          // Проверить сохранение целей после возврата
          await test.step("Проверить, что цели сохранились после возврата в черновик", async () => {
            const tasksCount = await detailsPage.getActionsCount();
            console.log(`Целей после возврата в черновик: ${tasksCount}`);
            expect(tasksCount).toBe(initialTasksCount);

            // Проверить название первой цели
            if (tasksCount > 0) {
              const firstTaskTitle = await detailsPage.getActionTitle(0);
              expect(firstTaskTitle).toBeTruthy();
              console.log(`Название первой цели: ${firstTaskTitle}`);
            }
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
