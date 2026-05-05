// tests/functional/development-plans/development-plan-create-from-template.spec.js
// TestRail: C2707 - Создание ИПР по шаблону из списка планов развития
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../utils/constants.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";

/** ID шаблона, созданного в beforeAll (для cleanup) */
let createdTemplateId = null;

test.describe(
  "Создание плана развития по шаблону",
  { tag: ["@ui", "@regression"] },
  () => {
    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }

      // Убедиться, что есть хотя бы один шаблон (иначе popup выбора типа не появится)
      const api = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: templates } = await api.getDevelopmentPlanTemplates();
      const hasTemplates =
        Array.isArray(templates) && templates.length > 0 ||
        (templates?.items && templates.items.length > 0) ||
        (templates?.results && templates.results.length > 0);

      if (!hasTemplates) {
        console.log("[beforeAll] Шаблонов нет — создаю тестовый шаблон через API");
        const { response, data } = await api.createDevelopmentPlanTemplate({
          title: `Авто-шаблон для C2707 ${Date.now()}`,
        });
        if (!response.ok()) {
          throw new Error(
            `Не удалось создать шаблон: ${response.status()} ${response.statusText()}`,
          );
        }
        createdTemplateId = data?.id ?? null;
        console.log("[beforeAll] Шаблон создан, id:", createdTemplateId);
      }
    });

    test.afterAll(async ({ request }) => {
      // Cleanup: удалить шаблон, созданный в beforeAll
      if (createdTemplateId) {
        try {
          const api = new DevelopmentPlansAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          await api.deleteDevelopmentPlanTemplate(createdTemplateId);
          console.log("[afterAll] Тестовый шаблон удалён:", createdTemplateId);
        } catch (e) {
          console.warn("[afterAll] Не удалось удалить тестовый шаблон:", e.message);
        }
        createdTemplateId = null;
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C2707: создать ИПР по шаблону из списка планов развития",
      { tag: ["@critical"] },
      async ({ adminAuth, page }, testInfo) => {
        setSeverity("critical");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);

        // Шаг 1: Перейти к планам развития и дождаться загрузки шаблонов
        await test.step('Перейти к "Планы развития"', async () => {
          // Перехватываем запрос шаблонов, чтобы дождаться его завершения.
          // Без этого кнопка "Создать план развития" является обычной ссылкой на /create,
          // и только после загрузки шаблонов JS превращает её в кнопку с popup.
          const templatesPromise = page.waitForResponse(
            (resp) =>
              resp.url().includes("development-plan-templates") &&
              resp.status() === 200,
            { timeout: TIMEOUTS.PAGE_LOAD },
          );

          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();

          // Дождаться загрузки API шаблонов
          await templatesPromise.catch(() => {
            console.warn("[C2707] Не дождались ответа API шаблонов — пробуем продолжить");
          });

          // Дополнительная стабилизация
          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        // Шаг 2: Нажать "Создать план развития" — должен появиться popup выбора типа
        await test.step('Нажать "Создать план развития" и убедиться что popup появился', async () => {
          await plansPage.clickCreatePlan();

          // Шаблоны гарантированно существуют (beforeAll), поэтому popup обязан появиться.
          // Текст кнопок в popup разбит на отдельные строки: "План развития" + "по шаблону",
          // поэтому getByText("План развития по шаблону") может не находить — ищем по regex.
          const templateOption = page
            .getByRole("button", { name: /план развития.*по шаблону/i })
            .first();
          const newPlanOption = page
            .getByRole("button", { name: /новый.*план развития/i })
            .first();

          await templateOption.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await expect(newPlanOption).toBeVisible({
            timeout: TIMEOUTS.SHORT,
          });
        });

        // Шаг 3: Выбрать "План развития по шаблону"
        await test.step('Выбрать "План развития по шаблону"', async () => {
          const templateOption = page
            .getByRole("button", { name: /план развития.*по шаблону/i })
            .first();
          await templateOption.click();

          await page
            .waitForLoadState("networkidle", { timeout: TIMEOUTS.MEDIUM })
            .catch(() => {});
        });

        // Шаг 4: Проверить страницу создания плана по шаблону
        await test.step("Проверить страницу создания плана по шаблону", async () => {
          // На странице должны быть поля для выбора шаблона и сотрудника
          const selectTemplate = page
            .locator('[class*="Select"]')
            .filter({ hasText: /Шаблон/i })
            .first();
          const selectEmployee = page
            .locator('[class*="Select"]')
            .filter({ hasText: /Сотрудник/i })
            .first();

          await selectTemplate.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await selectEmployee.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });

          // Кнопка "Создать план развития" должна быть неактивна (шаблон и сотрудник не выбраны)
          const createButton = page
            .getByRole("button", { name: /Создать план развития/i })
            .first();
          await expect(createButton).toBeDisabled({ timeout: TIMEOUTS.SHORT });
        });
      },
    );
  },
);
