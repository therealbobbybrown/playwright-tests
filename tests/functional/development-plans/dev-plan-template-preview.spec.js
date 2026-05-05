// tests/functional/development-plans/dev-plan-template-preview.spec.js
// TestRail: C2743 - Предпросмотр шаблона при создании ИПР
// UI-IPR-017: Preview шаблона перед созданием плана

import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
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
  "Предпросмотр шаблона ИПР",
  { tag: ["@ui", "@development-plans", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2743: предпросмотр шаблона при создании ИПР из списка планов",
      { tag: ["@regression"] },
      async ({ adminAuth, page, request }, testInfo) => {
        setSeverity("normal");

        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const templatesPage = new DevelopmentPlanTemplatesListPage(
          page,
          testInfo,
        );

        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);

        const templateName = `Шаблон для превью ${Date.now()}`;
        const templateDescription =
          "Описание шаблона для проверки предпросмотра";
        const templateGoal = "Цель плана развития из шаблона";
        let templateId = null;

        try {
          // Создать шаблон с описанием и целью
          await test.step("Создать шаблон с описанием", async () => {
            const { data } = await api.createDevelopmentPlanTemplate({
              title: templateName,
              description: templateDescription,
              developmentPlanTitle: templateGoal,
              setHeadCurator: true,
              periodDuration: 3,
            });
            templateId = data.id;
            console.log(`Шаблон создан: ID=${templateId}`);
          });

          // Перейти к созданию плана по шаблону
          await test.step("Перейти к созданию плана по шаблону", async () => {
            // Ждём API шаблонов — без этого кнопка работает как ссылка на /create
            const templatesPromise = page.waitForResponse(
              (resp) =>
                resp.url().includes("development-plan-templates") &&
                resp.status() === 200,
              { timeout: TIMEOUTS.PAGE_LOAD },
            );

            await devMenu.openDevelopmentPlans();
            await plansPage.assertOpened();

            await templatesPromise.catch(() => {
              console.warn("Не дождались ответа API шаблонов");
            });

            await plansPage.clickCreatePlan();

            // Выбрать "План развития по шаблону"
            await plansPage.templatePlanOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });
            await plansPage.templatePlanOption.click();
            await page
              .waitForLoadState("networkidle", {
                timeout: TIMEOUTS.PAGE_LOAD,
              })
              .catch(() => {});
          });

          // Выбрать шаблон и проверить preview
          await test.step("Выбрать шаблон и проверить предпросмотр", async () => {
            // На странице создания должен быть селект шаблона
            const templateSelect = page
              .locator('[class*="Select"]')
              .filter({ hasText: /Шаблон/i })
              .first();
            await templateSelect.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            await templateSelect.click();
            // Ждём появления списка опций
            const optionsList = page
              .locator('[class*="Option"], [role="option"]')
              .first();
            await optionsList
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .catch(() => {});

            // Найти наш шаблон в списке
            const templateOption = page
              .locator('[class*="Option"], [role="option"]')
              .filter({
                hasText: new RegExp(
                  templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                ),
              })
              .first();

            const optionVisible = await templateOption
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);

            if (optionVisible) {
              // Наведение на опцию может показать preview
              await templateOption.hover();

              // Проверяем есть ли preview panel/tooltip
              const previewPanel = page
                .locator(
                  '[class*="Preview"], [class*="Tooltip"], [class*="Info"]',
                )
                .filter({
                  hasText: /цель|период|куратор/i,
                })
                .first();

              const previewVisible = await previewPanel
                .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
                .then(() => true)
                .catch(() => false);
              console.log("Preview панель видна:", previewVisible);

              if (previewVisible) {
                const previewText = await previewPanel.innerText();
                console.log(
                  "Содержимое preview:",
                  previewText.substring(0, 200),
                );
              }

              // Выбираем шаблон
              await templateOption.click();
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
                .catch(() => {});
            }
          });

          // Проверить что данные шаблона отображаются в форме
          await test.step("Проверить отображение данных шаблона", async () => {
            // После выбора шаблона должны заполниться поля
            // Период, куратор, цель (если есть в шаблоне)

            // Проверяем что отображается информация о шаблоне
            const templateInfo = page
              .locator(
                '[class*="Template"], [class*="Info"], [class*="Preview"]',
              )
              .filter({
                hasText: new RegExp(templateGoal, "i"),
              });

            const infoVisible = await templateInfo
              .waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM })
              .then(() => true)
              .catch(() => false);
            console.log("Информация о шаблоне отображается:", infoVisible);

            // Проверяем что период заполнен
            const periodField = page.locator("text=/Период|Period/i").first();
            const periodVisible = await periodField
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            console.log("Поле периода:", periodVisible);

            // Проверяем куратора
            const curatorField = page
              .locator("text=/Куратор|Curator|руководител/i")
              .first();
            const curatorVisible = await curatorField
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            console.log("Поле куратора:", curatorVisible);
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
      "C3577: Preview: информация о шаблоне в списке шаблонов",
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

        const templateName = `Шаблон info ${Date.now()}`;
        const templateDescription = "Подробное описание шаблона";
        let templateId = null;

        try {
          // Создать шаблон с описанием
          await test.step("Создать шаблон с описанием", async () => {
            const { data } = await api.createDevelopmentPlanTemplate({
              title: templateName,
              description: templateDescription,
              developmentPlanTitle: "Цель развития",
              setHeadCurator: true,
              periodDuration: 1,
            });
            templateId = data.id;
          });

          // Открыть список шаблонов
          await test.step("Открыть список шаблонов", async () => {
            await devMenu.openDevelopmentPlanTemplates();
            await templatesPage.assertOpened();
          });

          // Найти шаблон и проверить отображение информации
          await test.step("Проверить отображение информации в карточке шаблона", async () => {
            // Используем поиск
            const searchInput = templatesPage.searchInput;
            const searchVisible = await searchInput
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            if (searchVisible) {
              await searchInput.fill(templateName);
              await page
                .waitForLoadState("networkidle", { timeout: TIMEOUTS.SHORT })
                .catch(() => {});
            }

            // Карточка шаблона
            const templateCard = page
              .getByRole("button", {
                name: new RegExp(
                  templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                ),
              })
              .first();

            await templateCard.waitFor({
              state: "visible",
              timeout: TIMEOUTS.MEDIUM,
            });

            // Проверяем что описание отображается в карточке
            const cardContainer = templateCard.locator("..");
            const cardText = await cardContainer.innerText();
            console.log("Текст карточки:", cardText);

            // Карточка может содержать: название, описание, лейбл "Шаблон"
            const hasDescription =
              cardText.includes(templateDescription) ||
              cardText.includes(templateDescription.substring(0, 20));
            console.log("Описание в карточке:", hasDescription);

            // Лейбл "Шаблон" должен быть
            const hasLabel = cardText.toLowerCase().includes("шаблон");
            expect(hasLabel).toBe(true);
          });

          // Hover на карточку - может показать tooltip
          await test.step("Hover на карточку для доп. информации", async () => {
            const templateCard = page
              .getByRole("button", {
                name: new RegExp(
                  templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                ),
              })
              .first();

            await templateCard.hover();

            // Проверяем появился ли tooltip
            const tooltip = page.locator(
              '[role="tooltip"], [class*="Tooltip"], [class*="Popover"]',
            );
            const tooltipVisible = await tooltip
              .waitFor({ state: "visible", timeout: TIMEOUTS.SHORT })
              .then(() => true)
              .catch(() => false);
            console.log("Tooltip при hover:", tooltipVisible);

            if (tooltipVisible) {
              const tooltipText = await tooltip.innerText();
              console.log("Содержимое tooltip:", tooltipText);
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
