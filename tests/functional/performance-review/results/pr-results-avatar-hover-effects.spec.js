import { test, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewAPI } from "../../../utils/api/PerformanceReviewAPI.js";
import { getCredentials } from "../../../utils/credentials.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";

test.describe(
  "Результаты оценки — Hover-эффекты аватаров в таблице результатов PR",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    let seededPrId = null;
    let prConfigPage;
    let prId;

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

      const baseUrl = new URL(process.env.BASE_URL).origin;
      await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
      await page.waitForLoadState("networkidle");
      await prConfigPage.goToResultsTab();

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const firstRow = page
        .locator("tr")
        .filter({ has: page.locator('[class*="Avatar_avatar"]') })
        .first();
      await firstRow.waitFor({ state: "visible", timeout: 10000 });
    });

    test(
      "C7499: Наведение на аватар в таблице результатов показывает тултип «Перейти в профиль»",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("normal");

        await test.step("Найти первый аватар в таблице результатов", async () => {
          const avatar = page
            .locator("tr")
            .filter({ has: page.locator('[class*="Avatar_avatar"]') })
            .first()
            .locator('[class*="Avatar_avatar"]')
            .first();
          await avatar.waitFor({ state: "visible", timeout: 10000 });
          await avatar.hover();
        });

        await test.step("Проверить появление тултипа «Перейти в профиль»", async () => {
          const tooltip = page
            .locator('[role="tooltip"]')
            .filter({ hasText: "Перейти в профиль" })
            .first();
          await tooltip.waitFor({ state: "visible", timeout: 5000 });

          const tooltipText = await tooltip.textContent();
          expect(
            tooltipText?.trim(),
            "Тултип должен содержать текст «Перейти в профиль»",
          ).toBe("Перейти в профиль");
        });
      },
    );
  },
);
