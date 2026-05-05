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
  "Исключение: Аватар на вкладке «Оцениваемые» НЕ ведёт в профиль",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    let seededPrId = null;
    let prConfigPage;
    let prId;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(180_000);
      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      // Нужен running/active PR — НЕ останавливаем
      const found = await seed.findOrCreatePRWithMultipleTargetUsers(2, { forceCreate: false });
      seededPrId = found.prId;
      console.log(`[beforeAll] Seeded PR: ${seededPrId}`);
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
        ["running", "active"].includes(pr.status),
      );

      if (!targetPR) {
        throw new Error("Нет PR в статусе running/active — запусти seed:pr");
      }

      prId = targetPR.id;

      const baseUrl = new URL(process.env.BASE_URL).origin;
      await page.goto(`${baseUrl}/ru/manager/performance-reviews/${prId}/`);
      await page.waitForLoadState("networkidle");

      await prConfigPage.goToEvaluatedTab();
    });

    test(
      "C7496: Клик по аватару оцениваемого на вкладке «Заполнение анкет» не переходит в профиль",
      { tag: ["@critical"] },
      async ({ adminAuth: page }) => {
        setSeverity("critical");

        await test.step("Найти первый аватар в таблице «Оцениваемые»", async () => {
          const firstAvatar = page.locator('[class*="Avatar_avatar"]').first();
          await firstAvatar.waitFor({ state: "visible", timeout: 10000 });
        });

        await test.step("Кликнуть по первому аватару в таблице", async () => {
          const firstAvatar = page.locator('[class*="Avatar_avatar"]').first();
          await firstAvatar.click();
        });

        await test.step("Проверить, что НЕ произошёл переход в профиль", async () => {
          await expect(
            page,
            "Клик по аватару оцениваемого НЕ должен переходить в /profile/",
          ).not.toHaveURL(/\/ru\/profile\/\d+/, { timeout: 2000 });
        });
      },
    );
  },
);
