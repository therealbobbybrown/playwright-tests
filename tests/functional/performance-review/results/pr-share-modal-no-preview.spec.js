// tests/functional/performance-review/results/pr-share-modal-no-preview.spec.js
// Admin UI тест: модалка "Поделиться с сотрудником" НЕ содержит кнопку предпросмотра

import { test as baseTest, expect } from "../../../fixtures/auth.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
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

test.describe(
  'Модалка "Поделиться с сотрудником" — отсутствие предпросмотра',
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
    let configPage = null;

    test.beforeAll(async ({ request }) => {
      test.setTimeout(120_000);

      const seed = new PerformanceReviewSeedHelper(request);
      await seed.init("admin");
      const pr = await seed.seedStoppedPR({ fillAssessments: true });
      prId = pr.id;

      if (!prId) throw new Error("Не удалось создать PR для тестов");
    });

    test.beforeEach(async () => {
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Share Modal No Preview");
    });

    /**
     * Кликнуть по опции в модалке (AccessOption_clickArea перехватывает клик по тексту).
     * Ищем блок-родитель с нужным текстом, затем кликаем по button внутри.
     */
    async function clickModalOption(modal, optionRegex) {
      const optionBlock = modal
        .locator('[class*="AccessOption"]')
        .filter({ hasText: optionRegex })
        .first();
      const btn = optionBlock.locator("button").first();
      await btn.click({ timeout: 10000 });
    }

    /** Открыть модалку "Поделиться с сотрудником" и вернуть её локатор */
    async function openShareModal(page) {
      // Скролл к нижней таблице
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);

      // Выбрать всех
      const selectAll = page
        .locator("label, span")
        .filter({ hasText: /выбрать всех/i })
        .first();
      await selectAll.waitFor({
        state: "visible",
        timeout: TIMEOUTS.PAGE_LOAD,
      });
      await selectAll.click();

      // Кнопка "Управление доступом"
      const accessBtn = page
        .locator("button")
        .filter({ hasText: /управление доступом/i })
        .first();
      await accessBtn.waitFor({ state: "visible", timeout: 5000 });
      await page
        .waitForFunction(
          () => {
            const buttons = Array.from(document.querySelectorAll("button"));
            const btn = buttons.find((b) =>
              b.textContent.includes("Управление доступом"),
            );
            return btn && !btn.disabled;
          },
          { timeout: 5000 },
        );
      await accessBtn.click({ timeout: TIMEOUTS.MEDIUM });

      // Модалка
      const modal = page
        .locator('[role="dialog"]')
        .filter({ hasText: /поделиться с сотрудником/i })
        .first();
      await modal.waitFor({ state: "visible", timeout: TIMEOUTS.MEDIUM });

      return modal;
    }

    test(
      'C7388: Модалка "Поделиться с сотрудником" не содержит кнопку предпросмотра',
      { tag: ["@regression"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("normal");
        test.slow();

        configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        await test.step("Открыть PR и вкладку Результаты", async () => {
          await adminPage.goto(
            `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
          );
          await configPage.goToResultsTab();
        });

        let modal;
        await test.step("Открыть модалку: Управление доступом", async () => {
          modal = await openShareModal(adminPage);
        });

        // Опция 1: "Не делиться результатами и оценкой"
        await test.step('"Не делиться" — нет кнопки предпросмотра', async () => {
          await clickModalOption(modal, /не делиться результатами/i);
          await page_assertNoPreviewButton(modal);
        });

        // Опция 2: "Только итоговой оценкой"
        await test.step('"Только итоговой оценкой" — нет кнопки предпросмотра', async () => {
          await clickModalOption(modal, /только итоговой оценкой/i);
          await page_assertNoPreviewButton(modal);
        });

        // Опция 3: "Результатами и итоговой оценкой"
        await test.step('"Результатами и итоговой оценкой" — нет кнопки предпросмотра', async () => {
          await clickModalOption(modal, /результатами и итоговой оценкой/i);
          await page_assertNoPreviewButton(modal);
        });

        await test.step('Закрыть модалку кнопкой "Отмена"', async () => {
          await modal
            .locator("button")
            .filter({ hasText: /отмена/i })
            .first()
            .click();
          await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
        });
      },
    );

    /**
     * Проверить, что в модалке НЕТ кнопки/ссылки "Предпросмотр" / "Preview".
     * Ищем любые кнопки, ссылки и текстовые элементы с этими словами.
     */
    async function page_assertNoPreviewButton(modal) {
      // Нет кнопок с текстом "предпросмотр" / "preview"
      await expect(
        modal.locator("button").filter({ hasText: /предпросмотр|preview/i }),
      ).toHaveCount(0);

      // Нет ссылок с текстом "предпросмотр" / "preview"
      await expect(
        modal.locator("a").filter({ hasText: /предпросмотр|preview/i }),
      ).toHaveCount(0);

      // Нет любого текста "предпросмотр" / "preview" в модалке
      await expect(modal.getByText(/предпросмотр|preview/i)).toHaveCount(0);
    }

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
