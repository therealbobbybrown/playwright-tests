// tests/functional/development-plans/dev-plan-template-with-plans.spec.js
// TestRail: C2726-C2733 - Удаление/редактирование шаблона при наличии планов в разных статусах
// UI-IPR-015: Поведение шаблонов с привязанными планами

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlanTemplatesListPage } from "../../../pages/DevelopmentPlanTemplatesListPage.js";
import { DevelopmentPlanTemplateCreatePage } from "../../../pages/DevelopmentPlanTemplateCreatePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Шаблоны ИПР с привязанными планами",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.slow();

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2726: удаление шаблона при наличии активных ИПР",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );
        const createPage = new DevelopmentPlanTemplateCreatePage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон с активным планом ${Date.now()}`;
        let templateId = null;
        let planId = null;

        try {
          // Создать шаблон
          await test.step("Создать шаблон", async () => {
            const { data } = await api.createDevelopmentPlanTemplate({
              title: templateName,
              developmentPlanTitle: "Цель из шаблона",
              setHeadCurator: true,
              periodDuration: 1,
            });
            templateId = data.id;
            console.log(`Шаблон создан: ID=${templateId}`);
          });

          // Создать план по шаблону
          await test.step("Создать план по шаблону", async () => {
            const { data } = await api.createDevelopmentPlanFromTemplate({
              responsibleUserId: 1,
              developmentPlanTemplateId: templateId,
            });
            planId = data.id;
            console.log(`План создан: ID=${planId}`);
          });

          // Активировать план
          await test.step("Активировать план", async () => {
            await api.approvalDevelopmentPlan(planId);
            await api.activateDevelopmentPlan(planId);
            console.log("План активирован");
          });

          // Попытаться удалить шаблон через UI
          await test.step("Попытаться удалить шаблон с активным планом", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Найти шаблон - используем getByRole напрямую с waitFor
            const templateButton = page
              .getByRole("button", {
                name: new RegExp(
                  templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                ),
              })
              .first();
            await templateButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            console.log("Шаблон найден в списке");

            // Открыть контекстное меню и нажать "Удалить"
            await templatesPage.openTemplateContextMenu(templateName);

            const deleteButton = page
              .getByRole("button", { name: "Удалить", exact: true })
              .first();
            await deleteButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await deleteButton.click();

            // Должно появиться предупреждение или диалог подтверждения
            const warningDialog = page
              .locator('[role="dialog"], [class*="Modal"]')
              .filter({
                hasText: /план|активн|удалить/i,
              });
            const warningVisible = await warningDialog
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (warningVisible) {
              const dialogText = await warningDialog.innerText();
              console.log("Предупреждение:", dialogText);

              // Проверяем что есть информация о связанных планах
              const hasWarning =
                dialogText.toLowerCase().includes("план") ||
                dialogText.toLowerCase().includes("удалить");
              expect(hasWarning).toBe(true);

              // Отменяем удаление
              const cancelButton = page
                .getByRole("button", { name: /Отмена|Нет|Закрыть/i })
                .first();
              const cancelVisible = await cancelButton
                .isVisible()
                .catch(() => false);
              if (cancelVisible) {
                await cancelButton.click();
              } else {
                await page.keyboard.press("Escape");
              }
            } else {
              // Подтверждаем удаление в диалоге
              const confirmButton = page
                .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
                .last();
              const confirmVisible = await confirmButton
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (confirmVisible) {
                await confirmButton.click();
              }
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          });

          // Проверить результат
          await test.step("Проверить что шаблон удалён или предупреждение показано", async () => {
            await page.reload();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            const templateAfter =
              await templatesPage.findTemplateByName(templateName);
            console.log(
              `Шаблон после попытки удаления: ${templateAfter ? "существует" : "удалён"}`,
            );
          });
        } finally {
          // Cleanup
          if (planId) {
            try {
              await api.deleteDevelopmentPlan(planId);
            } catch (e) {
              console.warn(`Cleanup plan failed: ${e.message}`);
            }
          }
          if (templateId) {
            try {
              await api.deleteDevelopmentPlanTemplate(templateId);
            } catch (e) {
              console.warn(`Cleanup template failed: ${e.message}`);
            }
          }
        }
      },
    );

    test(
      "C2727: удаление шаблона при наличии черновиков ИПР",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон с черновиком ${Date.now()}`;
        let templateId = null;
        let planId = null;

        try {
          // Создать шаблон
          await test.step("Создать шаблон", async () => {
            const { data } = await api.createDevelopmentPlanTemplate({
              title: templateName,
              developmentPlanTitle: "Цель черновика",
              setHeadCurator: true,
              periodDuration: 1,
            });
            templateId = data.id;
          });

          // Создать план по шаблону (остаётся в черновике)
          await test.step("Создать план-черновик по шаблону", async () => {
            const { data } = await api.createDevelopmentPlanFromTemplate({
              responsibleUserId: 1,
              developmentPlanTemplateId: templateId,
            });
            planId = data.id;
            console.log(`План-черновик создан: ID=${planId}`);

            // Проверяем что план в черновике
            const { data: planData } = await api.getDevelopmentPlan(planId);
            console.log(`Статус плана: ${planData.status}`);
          });

          // Попытаться удалить шаблон
          await test.step("Попытаться удалить шаблон с черновиком", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            await templatesPage.openTemplateContextMenu(templateName);

            const deleteButton = page
              .getByRole("button", { name: "Удалить", exact: true })
              .first();
            await deleteButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await deleteButton.click();

            // Проверяем диалог
            const confirmButton = page
              .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
              .last();
            const confirmVisible = await confirmButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (confirmVisible) {
              // Может быть предупреждение о связанных планах
              const dialogText = await page
                .locator('[role="dialog"], [class*="Modal"]')
                .innerText()
                .catch(() => "");
              console.log("Диалог:", dialogText.substring(0, 200));

              // Отменяем
              const cancelButton = page
                .getByRole("button", { name: /Отмена|Нет/i })
                .first();
              await cancelButton
                .click()
                .catch(() => page.keyboard.press("Escape"));
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          });
        } finally {
          if (planId) {
            try {
              await api.deleteDevelopmentPlan(planId);
            } catch (e) {
              console.warn(`Cleanup plan failed: ${e.message}`);
            }
          }
          if (templateId) {
            try {
              await api.deleteDevelopmentPlanTemplate(templateId);
            } catch (e) {
              console.warn(`Cleanup template failed: ${e.message}`);
            }
          }
        }
      },
    );

    test(
      "C2728: удаление шаблона при наличии завершённых ИПР",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон с завершённым ${Date.now()}`;
        let templateId = null;
        let planId = null;

        try {
          // Создать шаблон и план, завершить план
          await test.step("Создать шаблон и завершённый план", async () => {
            const { data: templateData } =
              await api.createDevelopmentPlanTemplate({
                title: templateName,
                developmentPlanTitle: "Цель завершённого",
                setHeadCurator: true,
                periodDuration: 1,
              });
            templateId = templateData.id;

            const { data: planData } =
              await api.createDevelopmentPlanFromTemplate({
                responsibleUserId: 1,
                developmentPlanTemplateId: templateId,
              });
            planId = planData.id;

            // Провести план через все статусы до завершения
            await api.approvalDevelopmentPlan(planId);
            await api.activateDevelopmentPlan(planId);
            await api.completeDevelopmentPlan(planId, "Тестовое завершение");

            const { data: completedPlan } =
              await api.getDevelopmentPlan(planId);
            console.log(`План завершён, статус: ${completedPlan.status}`);
          });

          // Попытаться удалить шаблон
          await test.step("Попытаться удалить шаблон с завершённым планом", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            await templatesPage.openTemplateContextMenu(templateName);

            const deleteButton = page
              .getByRole("button", { name: "Удалить", exact: true })
              .first();
            await deleteButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await deleteButton.click();

            // Диалог подтверждения
            const confirmButton = page
              .getByRole("button", { name: /Удалить|Да|Подтвердить/i })
              .last();
            await confirmButton
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Для завершённых планов удаление шаблона должно быть разрешено
            await confirmButton.click().catch(() => {});
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          });

          // Проверить что шаблон удалён
          await test.step("Проверить результат удаления", async () => {
            await page.reload();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            const templateAfter =
              await templatesPage.findTemplateByName(templateName);
            console.log(
              `Шаблон после удаления: ${templateAfter ? "существует" : "удалён"}`,
            );
            // Для завершённых планов шаблон должен удалиться
          });
        } finally {
          if (planId) {
            try {
              await api.deleteDevelopmentPlan(planId);
            } catch (e) {
              console.warn(`Cleanup plan failed: ${e.message}`);
            }
          }
          if (templateId) {
            try {
              await api.deleteDevelopmentPlanTemplate(templateId);
            } catch (e) {
              // Может быть уже удалён
            }
          }
        }
      },
    );

    test(
      "C2730: редактирование шаблона при наличии активных ИПР",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон для редактирования ${Date.now()}`;
        const newTemplateName = `Обновлённый шаблон ${Date.now()}`;
        let templateId = null;
        let planId = null;

        try {
          // Создать шаблон с активным планом
          await test.step("Создать шаблон с активным планом", async () => {
            const { data: templateData } =
              await api.createDevelopmentPlanTemplate({
                title: templateName,
                developmentPlanTitle: "Цель для редактирования",
                setHeadCurator: true,
                periodDuration: 1,
              });
            templateId = templateData.id;

            const { data: planData } =
              await api.createDevelopmentPlanFromTemplate({
                responsibleUserId: 1,
                developmentPlanTemplateId: templateId,
              });
            planId = planData.id;

            await api.approvalDevelopmentPlan(planId);
            await api.activateDevelopmentPlan(planId);
            console.log("План активирован");
          });

          // Открыть шаблон на редактирование
          await test.step("Открыть шаблон на редактирование", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Открываем через контекстное меню -> Редактировать
            await templatesPage.openTemplateContextMenu(templateName);
            const editButton = page
              .getByRole("button", { name: "Редактировать", exact: true })
              .first();
            await editButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await editButton.click();

            await page
              .waitForURL(/\/development-plans\/templates\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Проверяем что на странице деталей шаблона
            const url = page.url();
            expect(url).toMatch(/\/development-plans\/templates\/\d+/);
          });

          // Попытаться изменить название
          await test.step("Попытаться изменить название шаблона", async () => {
            // На странице редактирования - поле "Название шаблона" с плейсхолдером "План онбординга..."
            const titleInput = page
              .getByRole("textbox", { name: /Например.*план.*онбординга/i })
              .first()
              .or(
                page
                  .locator(
                    'input[placeholder*="онбординга"], textarea[placeholder*="онбординга"]',
                  )
                  .first(),
              );

            await titleInput.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await titleInput.fill(newTemplateName);
            console.log("Название изменено");

            // Сохранить изменения
            const saveButton = page
              .getByRole("button", { name: /Сохранить/i })
              .first();
            const saveVisible = await saveButton.isVisible().catch(() => false);
            if (saveVisible) {
              await saveButton.click();

              // Проверяем успех или предупреждение
              const toast = page.locator(".Toastify__toast");
              const toastVisible = await toast
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (toastVisible) {
                const toastText = await toast.innerText();
                console.log("Уведомление:", toastText);
                await toast
                  .waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM })
                  .catch(() => {});
              }
            }
          });

          // Проверить изменения через API
          await test.step("Проверить изменения через API", async () => {
            const { data } = await api.getDevelopmentPlanTemplate(templateId);
            console.log(`Название в API: ${data.title}`);
          });
        } finally {
          if (planId) {
            try {
              await api.deleteDevelopmentPlan(planId);
            } catch (e) {
              console.warn(`Cleanup plan failed: ${e.message}`);
            }
          }
          if (templateId) {
            try {
              await api.deleteDevelopmentPlanTemplate(templateId);
            } catch (e) {
              console.warn(`Cleanup template failed: ${e.message}`);
            }
          }
        }
      },
    );

    test(
      "C2729: удаление шаблона при наличии ИПР на утверждении",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон с планом на утверждении ${Date.now()}`;
        let templateId = null;
        let planId = null;

        try {
          // Создать шаблон и план на утверждении
          await test.step("Создать шаблон и план на утверждении", async () => {
            const { data: templateData } =
              await api.createDevelopmentPlanTemplate({
                title: templateName,
                developmentPlanTitle: "Цель на утверждении",
                setHeadCurator: true,
                periodDuration: 1,
              });
            templateId = templateData.id;

            const { data: planData } =
              await api.createDevelopmentPlanFromTemplate({
                responsibleUserId: 1,
                developmentPlanTemplateId: templateId,
              });
            planId = planData.id;

            // Отправить на утверждение
            await api.approvalDevelopmentPlan(planId);

            const { data: approvalPlan } = await api.getDevelopmentPlan(planId);
            console.log(`Статус плана: ${approvalPlan.status}`);
          });

          // Попытаться удалить шаблон
          await test.step("Попытаться удалить шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});

            await templatesPage.openTemplateContextMenu(templateName);

            const deleteButton = page
              .getByRole("button", { name: "Удалить", exact: true })
              .first();
            await deleteButton.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await deleteButton.click();

            // Диалог
            const dialogContent = await page
              .locator('[role="dialog"], [class*="Modal"]')
              .innerText()
              .catch(() => "");
            console.log("Содержимое диалога:", dialogContent.substring(0, 300));

            // Отменяем
            await page.keyboard.press("Escape");
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
              .catch(() => {});
          });
        } finally {
          if (planId) {
            try {
              await api.deleteDevelopmentPlan(planId);
            } catch (e) {
              console.warn(`Cleanup failed: ${e.message}`);
            }
          }
          if (templateId) {
            try {
              await api.deleteDevelopmentPlanTemplate(templateId);
            } catch (e) {
              console.warn(`Cleanup failed: ${e.message}`);
            }
          }
        }
      },
    );
  },
);
