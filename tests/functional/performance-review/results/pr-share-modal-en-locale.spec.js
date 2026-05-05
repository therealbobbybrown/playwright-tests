// tests/functional/performance-review/results/pr-share-modal-en-locale.spec.js
// Модалка "Поделиться с сотрудником" — проверка EN locale (отсутствие сырых i18n-ключей)

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { PerformanceReviewSeedHelper } from "../../../utils/seed/PerformanceReviewSeedHelper.js";
import {
  markAsUITest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import { TIMEOUTS } from "../../../utils/constants.js";

const test = baseTest.extend({
  prAPI: async ({ request }, use) => {
    const api = new PerformanceReviewAPI(request);
    const { email, password } = getCredentials("admin");
    await api.signIn(email, password);
    await use(api);
  },
});

/** Паттерны сырых i18n-ключей, которых НЕ должно быть в переведённом UI */
const RAW_I18N_PATTERNS = [/\{\{/, /_key_/, /\.key\./, /\bi18n\b/];

test.describe(
  "Модалка шаринга — EN locale",
  {
    tag: [
      "@performance-review",
      "@results",
      "@ui",
      "@regression",
      "@scoreOnly",
    ],
  },
  () => {
    test.describe.configure({ mode: "serial" });

    let prId = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(120_000);

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedStoppedPR({ fillAssessments: true });
      prId = pr.id;

      if (!prId) throw new Error("Не удалось создать PR для тестов");
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Share Modal EN");
    });

    /**
     * Открыть модалку "Поделиться с сотрудником" на EN locale.
     * Тексты кнопок могут быть на английском — используем гибкие локаторы.
     */
    async function openShareModalEN(page) {
      // Скролл к нижней таблице
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      // "Выбрать всех" / "Select all"
      const selectAll = page
        .locator("label, span")
        .filter({ hasText: /select all|выбрать всех/i })
        .first();
      await selectAll.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await selectAll.click();

      // "Управление доступом" / "Access control"
      const accessBtn = page
        .locator("button")
        .filter({ hasText: /access control|управление доступом/i })
        .first();
      await accessBtn.waitFor({ state: "visible", timeout: 5000 });
      await page
        .waitForFunction(
          () => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const btn = buttons.find((b) =>
              /access control|управление доступом/i.test(b.textContent),
            );
            return btn && !btn.disabled;
          },
          { timeout: 5000 },
        );
      await accessBtn.click({ timeout: TIMEOUTS.MEDIUM });

      // Модалка — ищем по role="dialog" с гибким текстом
      const modal = page
        .locator('[role="dialog"]')
        .filter({ hasText: /share with employee|поделиться с сотрудником/i })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      return modal;
    }

    test(
      "C7387: Модалка шаринга корректно отображается на английском языке (EN locale)",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("critical");
        test.slow();

        const baseUrl = new URL(process.env.BASE_URL).origin;

        // Навигация к PR на EN locale
        await test.step("Открыть PR на EN locale", async () => {
          await adminPage.goto(
            `${baseUrl}/en/manager/performance-reviews/${prId}/`,
          );
          await adminPage.waitForLoadState("domcontentloaded");
        });

        // Перейти на вкладку "Результаты" / "Results"
        await test.step("Перейти на вкладку Results", async () => {
          const resultsTab = adminPage
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^results$|^результаты$/i });
          await resultsTab.waitFor({
            state: "visible",
            timeout: TIMEOUTS.MEDIUM,
          });
          await resultsTab.click();
          await adminPage
            .waitForLoadState("networkidle", { timeout: 5_000 });
        });

        // Открыть модалку
        let modal;
        await test.step("Открыть модалку: Manage access", async () => {
          modal = await openShareModalEN(adminPage);
        });

        // Проверить что модалка не пуста и содержит реальный текст
        await test.step("Модалка содержит видимый текстовый контент", async () => {
          const modalText = await modal.innerText();
          expect(
            modalText.trim().length,
            "Модалка не должна быть пустой",
          ).toBeGreaterThan(10);
        });

        // Проверить отсутствие сырых i18n-ключей
        await test.step("Нет сырых i18n-ключей в модалке", async () => {
          const modalText = await modal.innerText();
          for (const pattern of RAW_I18N_PATTERNS) {
            expect(
              modalText,
              `Не должно быть сырых i18n-ключей: ${pattern}`,
            ).not.toMatch(pattern);
          }
        });

        // Проверить что все 3 опции видны (по реальным EN-текстам)
        await test.step("3 опции шаринга видны", async () => {
          await expect(modal.getByText(/do not share results/i)).toBeVisible();
          await expect(modal.getByText(/final rating only/i)).toBeVisible();
          await expect(
            modal.getByText(/results and final rating/i),
          ).toBeVisible();
        });

        // Проверить наличие кнопок Cancel/Done
        await test.step("Кнопки Cancel и Done присутствуют", async () => {
          const cancelBtn = modal
            .locator("button")
            .filter({ hasText: /cancel|отмена/i })
            .first();
          await expect(cancelBtn).toBeVisible();

          const doneBtn = modal
            .locator("button")
            .filter({ hasText: /done|готово|apply|save/i })
            .first();
          await expect(doneBtn).toBeVisible();
        });

        // Закрыть модалку
        await test.step("Закрыть модалку", async () => {
          const cancelBtn = modal
            .locator("button")
            .filter({ hasText: /cancel|отмена/i })
            .first();
          await cancelBtn.click();
          await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
        });
      },
    );

    test.afterAll(async ({ request }) => {
      if (prId) {
        try {
          const api = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await api.signIn(email, password);
          await api.archive(prId);
          await api.remove(prId);
        } catch {
          // ignore
        }
      }
    });
  },
);
