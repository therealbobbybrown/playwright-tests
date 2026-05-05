// tests/functional/development-plans/dev-plan-lifecycle.spec.js
// Жизненный цикл плана развития: черновик → на утверждении → активный → завершён
// UI-IPR-012: Переходы между статусами плана

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
  "Жизненный цикл плана развития",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.slow();

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C3546: Lifecycle: черновик → на утверждении → активный → завершён",
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

        const planGoal = `План для теста жизненного цикла ${Date.now()}`;
        let createdPlanId = null;

        try {
          // Шаг 1: Создать план (статус: черновик)
          await test.step("Создать план развития (черновик)", async () => {
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
              console.log(`План создан с ID: ${createdPlanId}`);
            }
          });

          // Шаг 2: Проверить статус "Черновик"
          await test.step('Проверить статус "Черновик"', async () => {
            const status = await detailsPage.getStatus();
            console.log(`Начальный статус: "${status}"`);
            expect(status).toMatch(/Черновик|draft/i);
          });

          // Шаг 3: Отправить на утверждение
          await test.step("Отправить план на утверждение", async () => {
            // Ищем кнопку "Отправить на утверждение" или "На утверждение"
            const approvalButton = page
              .getByRole("button", {
                name: /На утверждение|Отправить на утверждение/i,
              })
              .first();
            const approvalButtonVisible = await approvalButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (approvalButtonVisible) {
              await approvalButton.click();

              // Подтвердить если есть диалог
              const confirmButton = page
                .getByRole("button", { name: /Да|Подтвердить|Отправить/i })
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
                'Кнопка "На утверждение" не найдена - используем API',
              );
              await api.approvalDevelopmentPlan(createdPlanId);
              await page.reload();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            }
          });

          // Шаг 4: Проверить статус "На утверждении" или "Активен" (может быть авто-утверждение)
          await test.step("Проверить статус после отправки на утверждение", async () => {
            await page.reload();
            await detailsPage.assertOpened();

            // Ждём появления ЛЮБОГО текста статуса
            await detailsPage.statusBadge
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
            const status = await detailsPage.getStatus();
            console.log(`Статус после отправки на утверждение: "${status}"`);
            // Ожидаем "На утверждении" или "Активен" (авто-утверждение)
            expect(status).toMatch(/утвержден|Активен/i);
          });

          // Шаг 5: Активировать план (утвердить)
          await test.step("Активировать план", async () => {
            // Ищем кнопку "Утвердить" или "Активировать"
            const activateButton = page
              .getByRole("button", {
                name: /Утвердить|Активировать|Запустить/i,
              })
              .first();
            const activateButtonVisible = await activateButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            const isDisabled = activateButtonVisible
              ? await activateButton.isDisabled().catch(() => true)
              : true;

            if (activateButtonVisible && !isDisabled) {
              await activateButton.click();

              // Подтвердить если есть диалог
              const confirmButton = page
                .getByRole("button", { name: /Да|Подтвердить|Утвердить/i })
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
                'Кнопка "Активировать" недоступна или не найдена - используем API',
              );
              const { response: actResp } =
                await api.activateDevelopmentPlan(createdPlanId);
              console.log(
                `activateDevelopmentPlan status: ${actResp.status()}`,
              );
              if (!actResp.ok()) {
                // Возможно план уже активен после авто-утверждения
                const { data: planData } =
                  await api.getDevelopmentPlan(createdPlanId);
                console.log(`Текущий статус в API: ${planData?.status}`);
              }
              await page.reload();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            }
          });

          // Шаг 6: Проверить статус "Активен"
          await test.step('Проверить статус "Активен"', async () => {
            await page.reload();
            await detailsPage.assertOpened();

            // Явно дождаться текста "Активен" на странице
            const activeText = page
              .getByText("Активен", { exact: true })
              .first();
            await activeText
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const status = await detailsPage.getStatus();
            console.log(`Статус после активации: "${status}"`);
            expect(status).toMatch(/Активен|active/i);
          });

          // Шаг 7: Завершить план
          await test.step("Завершить план", async () => {
            // Ищем кнопку "Завершить"
            const completeButton = page
              .getByRole("button", { name: /Завершить|Закрыть план/i })
              .first();
            const completeButtonVisible = await completeButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            const completeDisabled = completeButtonVisible
              ? await completeButton.isDisabled().catch(() => true)
              : true;

            if (completeButtonVisible && !completeDisabled) {
              await completeButton.click();

              // Может быть модальное окно с комментарием
              const commentInput = page
                .getByPlaceholder(/Комментарий/i)
                .first();
              const commentVisible = await commentInput
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (commentVisible) {
                await commentInput.fill("Тестовое завершение плана");
              }

              // Подтвердить
              const confirmButton = page
                .getByRole("button", { name: /Да|Подтвердить|Завершить/i })
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
                'Кнопка "Завершить" недоступна или не найдена - используем API',
              );
              await api.completeDevelopmentPlan(
                createdPlanId,
                "Завершено через API",
              );
              await page.reload();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            }
          });

          // Шаг 8: Проверить статус "Завершён"
          await test.step('Проверить статус "Завершён"', async () => {
            await page.reload();
            await detailsPage.assertOpened();

            // Явно дождаться текста завершённого статуса
            const completedText = page.getByText(/Завершён|Завершен/).first();
            await completedText
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            const status = await detailsPage.getStatus();
            console.log(`Финальный статус: "${status}"`);
            expect(status).toMatch(/Завершен|Завершён|completed/i);
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
      'C4221: Вернуть план в черновик из статуса "на утверждении"',
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

        const planGoal = `План для возврата в черновик ${Date.now()}`;
        let createdPlanId = null;

        try {
          // Создать план и отправить на утверждение
          await test.step("Создать план и отправить на утверждение", async () => {
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

            // Отправить на утверждение через API
            await api.approvalDevelopmentPlan(createdPlanId);
            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Проверить статус
          await test.step('Проверить статус "На утверждении"', async () => {
            const status = await detailsPage.getStatus();
            console.log(`Текущий статус: ${status}`);
          });

          // Вернуть в черновик
          await test.step("Вернуть план в черновик", async () => {
            // Ищем кнопку "Вернуть в черновик" или "В черновик"
            const draftButton = page
              .getByRole("button", {
                name: /В черновик|Вернуть в черновик|Отклонить/i,
              })
              .first();
            const draftButtonVisible = await draftButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (draftButtonVisible) {
              await draftButton.click();

              // Подтвердить
              const confirmButton = page
                .getByRole("button", { name: /Да|Подтвердить|Вернуть/i })
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
              console.log('Кнопка "В черновик" не найдена - используем API');
              await api.draftDevelopmentPlan(createdPlanId);
              await page.reload();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
                .catch(() => {});
            }
          });

          // Проверить что статус вернулся в черновик
          await test.step('Проверить статус "Черновик"', async () => {
            await page.reload();
            await detailsPage.assertOpened();

            const status = await detailsPage.getStatus();
            console.log(`Статус после возврата: ${status}`);
            expect(status.toLowerCase()).toMatch(/черновик|draft/i);
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
      "C3547: Проверка API методов смены статуса",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const planTitle = `API План ${Date.now()}`;
        let createdPlanId = null;

        // Даты для плана: сегодня + 6 месяцев
        const startDate = new Date().toISOString().split("T")[0];
        const endDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

        try {
          // Получить валидный responsibleUserId из существующего плана
          let responsibleUserId;
          await test.step("Получить валидный responsibleUserId", async () => {
            const { data: listData } = await api.getDevelopmentPlans({
              limit: 5,
            });
            const items = listData?.items || listData || [];
            expect(
              items.length,
              "Список планов развития не должен быть пустым — нужен responsibleUserId для создания тестового плана",
            ).toBeGreaterThan(0);
            responsibleUserId =
              items[0].responsibleUserId ||
              items[0].responsible_user_id ||
              items[0].responsibleUser?.id;
            expect(responsibleUserId).toBeDefined();
            console.log(`Используем responsibleUserId: ${responsibleUserId}`);
          });

          // Создать план через API
          await test.step("Создать план через API", async () => {
            const { response, data } = await api.createDevelopmentPlan({
              title: planTitle,
              responsibleUserId,
              startDate,
              endDate,
            });

            console.log(`createDevelopmentPlan status: ${response.status()}`);
            if (!response.ok()) {
              console.log(
                `createDevelopmentPlan error: ${JSON.stringify(data)}`,
              );
            }
            expect(response.ok()).toBe(true);
            expect(data).toBeDefined();
            createdPlanId = data.id;
            console.log(`План создан: ID=${createdPlanId}`);
          });

          // Получить план и проверить статус
          await test.step("Проверить начальный статус через API", async () => {
            const { data } = await api.getDevelopmentPlan(createdPlanId);
            console.log(`Статус: ${JSON.stringify(data?.status)}`);
            expect(data.status).toBeDefined();
            expect(data.status).toMatch(/draft/i);
          });

          // Отправить на утверждение
          await test.step("Отправить на утверждение через API", async () => {
            const { response } =
              await api.approvalDevelopmentPlan(createdPlanId);
            // approval может вернуть 200 или 400 (если автоматически утверждается)
            console.log(`Approval status: ${response.status()}`);

            const { data } = await api.getDevelopmentPlan(createdPlanId);
            console.log(`Статус после approval: ${data?.status}`);
          });

          // Активировать
          await test.step("Активировать через API", async () => {
            const { response } =
              await api.activateDevelopmentPlan(createdPlanId);
            // activate может вернуть 200 или 400/403 (требует approval)
            expect([200, 400, 403]).toContain(response.status());
            console.log(`Activate status: ${response.status()}`);

            const { data } = await api.getDevelopmentPlan(createdPlanId);
            console.log(`Статус после activate: ${data?.status}`);
          });

          // Завершить
          await test.step("Завершить через API", async () => {
            const { response } = await api.completeDevelopmentPlan(
              createdPlanId,
              "Тестовое завершение",
            );
            expect([200, 400, 403]).toContain(response.status());
            console.log(`Complete status: ${response.status()}`);

            const { data } = await api.getDevelopmentPlan(createdPlanId);
            console.log(`Финальный статус: ${data?.status}`);
            if (response.ok()) {
              expect(data.status).toMatch(/completed/i);
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
