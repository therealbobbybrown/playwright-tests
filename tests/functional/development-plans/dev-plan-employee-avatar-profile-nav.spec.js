// tests/functional/development-plans/dev-plan-employee-avatar-profile-nav.spec.js
// TestRail: C7497
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import { ProfileMainPage } from "../../../pages/ProfileMainPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Планы развития — Переход в профиль через аватар сотрудника",
  { tag: ["@ui", "@ipr", "@regression"] },
  () => {
    let testPlanId = null;
    let planCreated = false;

    test.beforeAll(async ({ request }) => {
      const result = await ensureDevelopmentPlansEnabled(request);
      if (!result.isEnabled) {
        throw new Error("Не удалось включить модуль ИПР");
      }

      // Проверяем наличие ИПР, если нет — создаём
      const api = new DevelopmentPlansAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data: existing } = await api.getDevelopmentPlans({ limit: 1 });
      const hasPlans =
        (Array.isArray(existing) && existing.length > 0) ||
        (existing?.items && existing.items.length > 0);

      if (!hasPlans) {
        const adminId = api.getCurrentUserId();
        const { data: created, response } = await api.createDevelopmentPlan({
          title: `Автотест ИПР аватар сотрудника ${Date.now()}`,
          responsibleUserId: adminId,
        });
        expect(response.ok(), "Не удалось создать ИПР для теста").toBeTruthy();
        testPlanId = created?.id || created?.data?.id;
        planCreated = true;
        console.log(`Создан ИПР для теста: id=${testPlanId}`);
      }
    });

    test.afterAll(async ({ request }) => {
      if (planCreated && testPlanId) {
        const api = new DevelopmentPlansAPI(request);
        const { email, password } = getCredentials("admin");
        await api.signIn(email, password);
        await api.deleteDevelopmentPlan(testPlanId);
        console.log(`Удалён тестовый ИПР: id=${testPlanId}`);
      }
    });

    test.beforeEach(() => {
      markAsUITest(MODULES.DEVELOPMENT);
    });

    test(
      "C7501: Клик по аватару сотрудника в списке ИПР открывает его профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let employeeName;

        await test.step('Открыть "Планы развития"', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
        });

        await test.step("Проверить, что список не пуст", async () => {
          const rowCount = await plansPage.tableRows.count();
          expect(
            rowCount,
            "В таблице должна быть хотя бы одна строка",
          ).toBeGreaterThan(0);
        });

        await test.step("Получить имя сотрудника из первой строки", async () => {
          const firstRow = plansPage.tableRows.first();
          const employeeCell = firstRow.locator("td").first();
          const text = await employeeCell.innerText();
          const lines = text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          employeeName = lines.find((l) => l.length > 2) || lines[0] || "";
          console.log(`Имя сотрудника: ${employeeName}`);
        });

        await test.step("Кликнуть по аватару сотрудника в первой строке", async () => {
          const firstRow = plansPage.tableRows.first();
          const employeeCell = firstRow.locator("td").first();
          const avatar = employeeCell
            .locator('[class*="Avatar_avatar"]')
            .first();
          await avatar.waitFor({ state: "visible", timeout: 10000 });
          await avatar.click();
        });

        await test.step("Проверить переход в профиль сотрудника", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          if (employeeName) {
            await profilePage.assertProfileBelongsTo(employeeName);
          }
        });
      },
    );
  },
);
