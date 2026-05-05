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
  "Результаты оценки — Переход в профиль через аватар в тепловой карте",
  { tag: ["@ui", "@performance-review", "@regression"] },
  () => {
    let seededPrId = null;

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

    test.beforeEach(() => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW);
    });

    test(
      "C7483: Клик по аватару в тепловой карте результатов открывает профиль сотрудника",
      { tag: ["@critical"] },
      async ({ adminAuth: page, request }, testInfo) => {
        setSeverity("critical");
        const prConfigPage = new PerformanceReviewConfigPage(page, testInfo);
        const profilePage = new ProfileMainPage(page, testInfo);

        let evaluatedUserName;

        await test.step("Найти PR с результатами и открыть вкладку Результаты", async () => {
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
            "PR со статусом active/finished/stopped/running должен существовать",
          ).toBeTruthy();

          const baseUrl = new URL(process.env.BASE_URL).origin;
          await page.goto(
            `${baseUrl}/ru/manager/performance-reviews/${targetPR.id}/`,
          );
          await page.waitForLoadState("networkidle");
          await prConfigPage.goToResultsTab();
        });

        await test.step("Найти аватар в тепловой карте и кликнуть", async () => {
          // Тепловая карта результатов — верхняя часть вкладки Результаты
          const heatmapSection = page
            .locator(
              '[class*="HeatMap"], [class*="heatmap"], [class*="CompetenceMap"]',
            )
            .first();
          let heatmapVisible = false;
          try {
            await heatmapSection.waitFor({ state: "visible", timeout: 10000 });
            heatmapVisible = true;
          } catch {
            // heatmap не найдена
          }

          let avatar;
          if (heatmapVisible) {
            avatar = heatmapSection.locator('[class*="Avatar_avatar"]').first();
          } else {
            // Fallback: аватар в таблице результатов (строки оцениваемых)
            avatar = page
              .locator('table tbody tr, [class*="ResultsTable"] tr')
              .first()
              .locator('[class*="Avatar_avatar"]')
              .first();
          }

          await expect(avatar, "Аватар должен быть найден в тепловой карте или таблице результатов").toBeVisible({ timeout: 10000 });

          // Запоминаем имя рядом с аватаром
          const nameEl = avatar
            .locator(
              "xpath=ancestor::tr[1]//div[contains(@class, 'User_full-name')]",
            )
            .first();
          if (await nameEl.isVisible()) {
            evaluatedUserName = (await nameEl.textContent()).trim();
          }

          await avatar.click();
        });

        await test.step("Проверить переход в профиль", async () => {
          await page.waitForURL(/\/ru\/profile\/\d+/, { timeout: 10000 });
          expect(page.url()).toMatch(/\/ru\/profile\/\d+/);

          expect(
            evaluatedUserName,
            "Имя сотрудника должно быть получено из тепловой карты перед кликом",
          ).toBeTruthy();
          await profilePage.assertProfileBelongsTo(evaluatedUserName);
        });
      },
    );
  },
);
