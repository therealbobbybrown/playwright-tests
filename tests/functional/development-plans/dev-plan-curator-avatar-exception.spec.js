// tests/functional/development-plans/dev-plan-curator-avatar-exception.spec.js
// TestRail: C7498
import { expect } from "@playwright/test";
import { test } from "../../fixtures/auth.js";
import { DevelopmentMenuHelper } from "../../../pages/menu/DevelopmentMenuHelper.js";
import { DevelopmentPlansListPage } from "../../../pages/DevelopmentPlansListPage.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../utils/allure-helpers.js";
import { ensureDevelopmentPlansEnabled } from "../../utils/helpers/ensureDevelopmentPlansEnabled.js";
import { DevelopmentPlansAPI } from "../../utils/api/DevelopmentPlansAPI.js";
import { getCredentials } from "../../utils/credentials.js";

test.describe(
  "Планы развития — Аватар куратора не ведёт в профиль",
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
          title: `Автотест ИПР аватар куратора ${Date.now()}`,
          responsibleUserId: adminId,
          curatorIds: [adminId],
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
      "C7500: Клик по аватару куратора в ИПР не открывает профиль куратора",
      { tag: ["@critical"] },
      async ({ adminAuth: page }, testInfo) => {
        setSeverity("critical");
        const devMenu = new DevelopmentMenuHelper(page, testInfo);
        const plansPage = new DevelopmentPlansListPage(page, testInfo);

        let curatorAvatarFound = false;

        await test.step('Открыть "Планы развития"', async () => {
          await devMenu.openDevelopmentPlans();
          await plansPage.assertOpened();
        });

        await test.step("Найти строку с куратором", async () => {
          const rowCount = await plansPage.tableRows.count();
          expect(
            rowCount,
            "Список ИПР не должен быть пустым (ИПР создаётся в beforeAll)",
          ).toBeGreaterThan(0);

          for (let i = 0; i < rowCount; i++) {
            const row = plansPage.tableRows.nth(i);
            // Куратор находится в третьей ячейке td (index 2: Сотрудник, Цель, Кураторы)
            const curatorCell = row.locator("td").nth(2);
            const avatar = curatorCell
              .locator('[class*="Avatar_avatar"]')
              .first();
            const isVisible = await avatar
              .waitFor({ state: "visible", timeout: 2000 })
              .then(() => true)
              .catch(() => false);

            if (isVisible) {
              curatorAvatarFound = true;
              const urlBefore = page.url();

              await test.step(`Кликнуть по аватару куратора в строке ${i + 1}`, async () => {
                await avatar.click();
              });

              await test.step("Проверить, что URL не изменился на профиль", async () => {
                await expect(page).not.toHaveURL(/\/ru\/profile\/\d+/, {
                  timeout: 2000,
                });
                console.log(
                  `URL после клика по аватару куратора: ${page.url()}`,
                );
                expect(page.url()).toBe(urlBefore);
              });

              break;
            }
          }

          expect(
            curatorAvatarFound,
            "Должен найтись хотя бы один ИПР с аватаром куратора",
          ).toBeTruthy();
        });
      },
    );
  },
);
