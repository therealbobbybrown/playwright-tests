// tests/functional/home/home-todo-ipr.spec.js
import { test, expect } from "../../fixtures/auth.js";
import { HomePage } from "../../../pages/HomePage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";

test.describe(
  "Главная страница - ИПР",
  { tag: ["@home", "@todolist", "@regression"] },
  () => {
    let createdPlanId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(60_000);
      await ensureDevelopmentPlansEnabled(request);

      const api = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);
      const userId = api.getCurrentUserId();

      // Ищем активный план для текущего пользователя (responsible = текущий юзер)
      const { data } = await api.getDevelopmentPlans({});
      const plans = data?.items || data || [];
      const activePlan = plans.find(
        (p) =>
          p.status === "active" &&
          !p.isArchived &&
          p.responsibleUserId === userId,
      );
      if (activePlan) {
        return; // Активный план для текущего юзера есть
      }

      // Создаём план → добавляем цель → активируем
      const startDate = new Date().toISOString();
      const endDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { response: createResp, data: created } =
        await api.createDevelopmentPlan({
          title: `Автотест ИПР Home ${Date.now()}`,
          responsibleUserId: userId,
          startDate,
          endDate,
        });
      if (!createResp.ok()) {
        throw new Error(
          `Не удалось создать ИПР: ${createResp.status()}`,
        );
      }
      const planId = created?.id || created?.data?.id;

      // Добавляем цель — без неё план нельзя активировать
      await api.saveDevelopmentPlanObjective(planId, {
        title: "Автотест цель для ИПР Home",
      });

      const { response: activateResp } =
        await api.activateDevelopmentPlan(planId);
      if (!activateResp.ok()) {
        // Если активация не удалась — план останется draft, тесты упадут с понятной ошибкой
        console.warn(
          `[home-todo-ipr] Не удалось активировать ИПР ${planId}: ${activateResp.status()}`,
        );
      }
      createdPlanId = planId;
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.HOME, "Todo List");
    });

    test(
      "C3849: Карточка плана развития (ИПР) отображается при наличии",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить карточку ИПР", async () => {
          await expect(homePage.devPlanCard).toBeVisible({ timeout: 10000 });
          await homePage.assertDevPlanCard();
        });
      },
    );

    test(
      "C3850: Прогресс ИПР отображается корректно",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Проверить прогресс ИПР", async () => {
          await expect(homePage.devPlanCard).toBeVisible({ timeout: 10000 });
          const progress = await homePage.getDevPlanProgress();
          expect(progress.completed).toBeGreaterThanOrEqual(0);
          expect(progress.total).toBeGreaterThanOrEqual(0);
          expect(progress.completed).toBeLessThanOrEqual(progress.total);
        });
      },
    );

    test(
      "C3851: Клик на карточку ИПР ведёт на страницу плана",
      { tag: ["@regression", "@ipr"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("normal");
        const homePage = new HomePage(page, testInfo);

        await test.step("Открыть главную страницу", async () => {
          await homePage.goto();
        });

        await test.step("Клик на карточку ИПР", async () => {
          await expect(homePage.devPlanCard).toBeVisible({ timeout: 10000 });
          await homePage.clickDevPlanCard();
        });
      },
    );
  },
);
