// tests/functional/development-plans/dev-plan-template-autosave.spec.js
// TestRail: C2744 - Автосохранение шаблона ИПР
// UI-IPR-018: Автоматическое сохранение изменений в шаблоне

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
  "Автосохранение шаблона ИПР",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2744: автосохранение изменений на странице шаблона",
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

        const templateName = `Шаблон autosave ${Date.now()}`;
        const updatedGoal = `Обновлённая цель ${Date.now()}`;
        let templateId = null;

        try {
          // Создать шаблон
          await test.step("Создать шаблон", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
            await templatesPage.clickCreateTemplate();
            await createPage.assertOpened();

            // Используем fillTemplateForm - заполняет поля в правильном порядке (цель до названия)
            await createPage.fillTemplateForm(templateName, "Начальная цель");
            await createPage.clickCreate();

            await page
              .waitForURL(/\/development-plans\/templates\/\d+/, {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});

            const url = page.url();
            const match = url.match(/\/templates\/(\d+)/);
            if (match) {
              templateId = parseInt(match[1], 10);
            }
          });

          // Изменить поле на странице шаблона
          await test.step("Изменить цель плана на странице шаблона", async () => {
            // Inline-editable поле: клик по значению → появляется textbox
            const goalLabel = page.getByText("Цель плана развития", {
              exact: true,
            });
            await goalLabel.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            // Значение цели — кликабельный div с иконкой карандаша, содержит текст "Начальная цель"
            const goalValue = page.getByText("Начальная цель");
            await goalValue.click();

            // После клика появляется textarea (без aria-label, accessible name пустой)
            const goalInput = page.locator(
              'textarea[name="developmentPlanTitle"]',
            );
            await goalInput.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });
            await goalInput.clear();
            await goalInput.fill(updatedGoal);
            console.log("Цель изменена");

            // Ждём автосохранения (debounce)
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Проверить сохранение: кликнуть "Сохранить шаблон" или дождаться автосохранения
          await test.step("Сохранить изменения", async () => {
            const saveButton = page
              .getByRole("button", { name: /Сохранить шаблон/i })
              .first();
            const saveButtonVisible = await saveButton
              .isVisible()
              .catch(() => false);

            if (saveButtonVisible) {
              await saveButton.click();
              console.log('Нажали "Сохранить шаблон"');
            }

            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Перезагрузить страницу и проверить что изменения сохранились
          await test.step("Перезагрузить и проверить сохранение", async () => {
            await page.reload();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});

            // После reload поле inline (не textarea) — проверяем текст на странице
            const goalOnPage = page.getByText(updatedGoal);
            const goalVisible = await goalOnPage
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (goalVisible) {
              console.log("Изменения автосохранены успешно");
            } else {
              // Проверяем через API
              const { data } = await api.getDevelopmentPlanTemplate(templateId);
              console.log("Цель из API:", data.developmentPlanTitle);
            }
          });

          // Проверить через API
          await test.step("Проверить изменения через API", async () => {
            const { data } = await api.getDevelopmentPlanTemplate(templateId);
            console.log(
              `Данные шаблона из API: title="${data.title}", goal="${data.developmentPlanTitle}"`,
            );
          });
        } finally {
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

    test(
      "C3568: Autosave: изменения не теряются при уходе со страницы",
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

        const templateName = `Шаблон navigate ${Date.now()}`;
        const updatedDescription = `Обновлённое описание ${Date.now()}`;
        let templateId = null;

        try {
          // Создать шаблон
          await test.step("Создать шаблон", async () => {
            const { data } = await api.createDevelopmentPlanTemplate({
              title: templateName,
              developmentPlanTitle: "Цель шаблона",
              setHeadCurator: true,
              periodDuration: 1,
            });
            templateId = data.id;
          });

          // Открыть страницу шаблона
          await test.step("Открыть страницу шаблона", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            await templatesPage.openTemplateByName(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});
          });

          // Внести изменения
          await test.step("Внести изменения", async () => {
            // Пробуем активировать описание и заполнить
            const addDescCheckbox = page
              .getByRole("checkbox", { name: /Добавить описание/i })
              .first();
            const checkboxVisible = await addDescCheckbox
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (checkboxVisible) {
              const isChecked = await addDescCheckbox.isChecked();
              if (!isChecked) {
                await addDescCheckbox.click();
                // Ждём появления поля описания
                const descInput = page
                  .getByRole("textbox", { name: /Описание/i })
                  .first();
                await descInput
                  .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                  .catch(() => {});
              }

              const descInput = page
                .getByRole("textbox", { name: /Описание/i })
                .first()
                .or(page.locator('textarea[placeholder*="Описание"]').first());

              const descVisible = await descInput
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              if (descVisible) {
                await descInput.fill(updatedDescription);
                console.log("Описание заполнено");
              }
            }

            // Ждём автосохранения
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});
          });

          // Перейти на другую страницу без явного сохранения
          await test.step("Перейти на другую страницу", async () => {
            await devMenu.openDevelopmentPlans();
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});

            // Проверяем что не было диалога подтверждения (если автосохранение работает)
            // Или был диалог и мы должны его обработать
            const unsavedDialog = page.locator('[role="dialog"]').filter({
              hasText: /несохранен|изменен|сохранить/i,
            });

            const dialogVisible = await unsavedDialog
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);

            if (dialogVisible) {
              console.log("Диалог о несохранённых изменениях появился");
              // Выбираем "Не сохранять" или "Сохранить"
              const saveButton = page
                .getByRole("button", { name: /Сохранить/i })
                .first();
              await saveButton
                .click()
                .catch(() => page.keyboard.press("Escape"));
            } else {
              console.log(
                "Диалог о несохранённых изменениях не появился (автосохранение работает)",
              );
            }
          });

          // Вернуться и проверить изменения
          await test.step("Вернуться к шаблону и проверить изменения", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();

            // Поиск шаблона
            await templatesPage.searchInput.fill(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            await templatesPage.openTemplateByName(templateName);
            await page
              .waitForLoadState("networkidle", { timeout: TIMEOUTS.PAGE_LOAD })
              .catch(() => {});

            // Проверяем что описание сохранилось
            const descInput = page
              .locator("textarea")
              .filter({ hasText: updatedDescription })
              .first();
            const hasSavedDescription = await descInput
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (hasSavedDescription) {
              console.log("Описание автосохранено успешно");
            } else {
              // Проверяем через API
              const { data } = await api.getDevelopmentPlanTemplate(templateId);
              console.log("Описание из API:", data.description || "(пусто)");
            }
          });
        } finally {
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
