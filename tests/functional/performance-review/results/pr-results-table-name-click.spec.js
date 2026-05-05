import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { ProfileMainPage } from "../../../../pages/ProfileMainPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

test.describe(
  "Результаты оценки — Переход в профиль через имя в таблице",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    let seededPrId = null;
    let prConfigPage;
    let profilePage;
    let prId;
    let evaluatedUserName;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: false });
      const filled = await seed.fillQuestionnaires(found.prId);
      const { response } = await seed.prAPI.stop(found.prId);
      if (!response.ok()) console.warn("[beforeAll] Failed to stop PR");
      seededPrId = found.prId;
      console.log(`[beforeAll] Seeded PR: ${seededPrId}, filled: ${filled}`);
    });

    test.beforeEach(async ({ adminAuth: page, request }, testInfo) => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
      prConfigPage = new PerformanceReviewConfigPage(page, testInfo);
      profilePage = new ProfileMainPage(page, testInfo);

      // Найти PR с результатами через API
      const api = new PerformanceReviewAPI(request);
      const { email, password } = getCredentials("admin");
      await api.signIn(email, password);

      const { data } = await api.getList();
      let prItems = data?.items || data || [];

      // Приоритизируем seeded PR — ставим его первым
      if (seededPrId) {
        const idx = prItems.findIndex(
          (p) => p.id === seededPrId || String(p.id) === String(seededPrId),
        );
        if (idx > 0) {
          const [seededPR] = prItems.splice(idx, 1);
          prItems = [seededPR, ...prItems];
        }
      }

      const targetPR = prItems.find((pr) =>
        ["active", "finished", "stopped", "running"].includes(pr.status),
      );
      expect(
        targetPR,
        "Должен существовать PR со статусом active/finished/stopped/running",
      ).toBeTruthy();
      prId = targetPR.id;

      // Открыть страницу PR и перейти на вкладку Результаты
      const baseUrl = new URL(process.env.BASE_URL).origin;
      await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
      await page.waitForLoadState("networkidle");
      await prConfigPage.goToResultsTab();

      // Прокрутить вниз к таблице сотрудников
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      // Получить имя первого оцениваемого
      const firstUserRow = page
        .locator("tr")
        .filter({
          has: page.locator('[class*="Avatar_avatar"]'),
        })
        .first();
      await firstUserRow.waitFor({ state: "visible", timeout: 10000 });
      const nameEl = firstUserRow
        .locator('[class*="User_full-name-wrapper"] > div')
        .first();
      evaluatedUserName = (await nameEl.textContent()).trim();
    });

    test(
      "C7485: Клик по имени оцениваемого в таблице результатов открывает профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Кликнуть по имени оцениваемого", async () => {
          await prConfigPage.clickEmployeeNameInResults(evaluatedUserName);
        });

        await test.step("Проверить переход в профиль", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);
          await profilePage.assertProfileBelongsTo(evaluatedUserName);
        });
      },
    );
  },
);
