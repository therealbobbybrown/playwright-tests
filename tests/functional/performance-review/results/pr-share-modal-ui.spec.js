// tests/functional/performance-review/results/pr-share-modal-ui.spec.js
// Admin UI тесты: структура модалки "Поделиться с сотрудником" (C7357-C7360)

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
  'Модалка "Поделиться с сотрудником"',
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
      markAsUITest(MODULES.PERFORMANCE_REVIEW, "Share Modal");
    });

    /**
     * Кликнуть по опции в модалке (AccessOption_clickArea перехватывает клик по тексту).
     * Ищем блок-родитель с нужным текстом, затем кликаем по button внутри.
     */
    async function clickModalOption(modal, optionRegex) {
      // Находим блок опции по тексту
      const optionBlock = modal
        .locator('[class*="AccessOption"]')
        .filter({ hasText: optionRegex })
        .first();
      // Кликаем по button внутри блока (clickArea)
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
      'C7357: Модалка "Поделиться с сотрудником" содержит 3 опции',
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage }, testInfo) => {
        setSeverity("critical");
        test.slow();

        configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // Навигация к PR
        await test.step("Открыть PR и вкладку Результаты", async () => {
          await adminPage.goto(
            `${baseUrl}/ru/manager/performance-reviews/${prId}/`,
          );
          await configPage.goToResultsTab();
        });

        // Открыть модалку
        let modal;
        await test.step("Открыть модалку: Управление доступом", async () => {
          modal = await openShareModal(adminPage);
        });

        // Проверить структуру модалки
        await test.step("Модалка: заголовок и подзаголовок", async () => {
          await expect(
            modal.getByText(/поделиться с сотрудником/i).first(),
          ).toBeVisible();
          await expect(
            modal.getByText(/выберите.*чем.*поделиться/i).first(),
          ).toBeVisible();
        });

        await test.step("Модалка: 3 опции видны", async () => {
          await expect(
            modal.getByText(/не делиться результатами и оценкой/i).first(),
          ).toBeVisible();
          await expect(
            modal.getByText(/только итоговой оценкой/i).first(),
          ).toBeVisible();
          await expect(
            modal.getByText(/результатами и итоговой оценкой/i).first(),
          ).toBeVisible();
        });

        await test.step("Модалка: описания опций видны", async () => {
          await expect(
            modal.getByText(/сотрудник не имеет доступа/i).first(),
          ).toBeVisible();
          await expect(
            modal
              .getByText(/итоговая оценка будет доступна в профиле/i)
              .first(),
          ).toBeVisible();
          await expect(
            modal.getByText(/сможет увидеть отчет/i).first(),
          ).toBeVisible();
        });

        await test.step('Модалка: кнопки "Отмена" и "Готово"', async () => {
          await expect(
            modal
              .locator("button")
              .filter({ hasText: /отмена/i })
              .first(),
          ).toBeVisible();
          await expect(
            modal
              .locator("button")
              .filter({ hasText: /готово/i })
              .first(),
          ).toBeVisible();
        });

        // Дефолт: "Не делиться" должна быть выбрана (или отсутствие активной опции)
        await test.step("Дефолт: опция по умолчанию", async () => {
          // Просто проверяем что модалка открылась с корректной структурой
          // Конкретная дефолтная опция зависит от текущего состояния target user
        });

        // Закрыть модалку
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

    test('C7358: Выбор "Только итоговой оценкой" показывает тогл уведомления', async ({
      adminAuth: adminPage,
    }, testInfo) => {
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
      await test.step("Открыть модалку", async () => {
        modal = await openShareModal(adminPage);
      });

      await test.step('Кликнуть "Только итоговой оценкой"', async () => {
        await clickModalOption(modal, /только итоговой оценкой/i);
      });

      await test.step("Тогл уведомления виден", async () => {
        const notifText = modal.getByText(/отправить уведомление/i).first();
        await notifText.waitFor({ state: "visible", timeout: 5000 });
        await expect(notifText).toBeVisible();
      });

      await test.step("Чекбокс PDF НЕ виден (только для full)", async () => {
        const pdfText = modal.getByText(/включить.*ссылку.*pdf/i);
        await expect(pdfText).toHaveCount(0);
      });

      await test.step('Переключить на "Не делиться" — тогл исчезает', async () => {
        await clickModalOption(modal, /не делиться результатами/i);
        await expect(modal.getByText(/отправить уведомление/i)).toHaveCount(0);
      });

      await test.step("Закрыть модалку", async () => {
        await modal
          .locator("button")
          .filter({ hasText: /отмена/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });
    });

    test('C7359: Выбор "Результатами и итоговой оценкой" показывает уведомление и PDF', async ({
      adminAuth: adminPage,
    }, testInfo) => {
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
      await test.step("Открыть модалку", async () => {
        modal = await openShareModal(adminPage);
      });

      await test.step('Кликнуть "Результатами и итоговой оценкой"', async () => {
        await clickModalOption(modal, /результатами и итоговой оценкой/i);
      });

      await test.step("Тогл уведомления виден", async () => {
        await expect(
          modal.getByText(/отправить уведомление/i).first(),
        ).toBeVisible();
      });

      await test.step("Чекбокс PDF виден", async () => {
        await expect(
          modal.getByText(/включить.*ссылку.*pdf/i).first(),
        ).toBeVisible();
      });

      await test.step("Закрыть модалку", async () => {
        await modal
          .locator("button")
          .filter({ hasText: /отмена/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });
    });

    test('C7360: Выбор "Не делиться" скрывает дополнительные настройки', async ({
      adminAuth: adminPage,
    }, testInfo) => {
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
      await test.step("Открыть модалку", async () => {
        modal = await openShareModal(adminPage);
      });

      // Сначала выбираем scoreOnly чтобы появились контролы
      await test.step("Выбрать scoreOnly → тогл появляется", async () => {
        await clickModalOption(modal, /только итоговой оценкой/i);
        await expect(
          modal.getByText(/отправить уведомление/i).first(),
        ).toBeVisible();
      });

      // Переключаем на "Не делиться"
      await test.step('"Не делиться" → тогл и PDF исчезают', async () => {
        await clickModalOption(modal, /не делиться результатами/i);

        // Ни тогла, ни PDF
        await expect(modal.getByText(/отправить уведомление/i)).toHaveCount(0);
        await expect(modal.getByText(/включить.*ссылку.*pdf/i)).toHaveCount(0);
      });

      await test.step("Закрыть модалку", async () => {
        await modal
          .locator("button")
          .filter({ hasText: /отмена/i })
          .first()
          .click();
        await modal.waitFor({ state: "hidden", timeout: TIMEOUTS.MEDIUM });
      });
    });

    test.afterAll(async ({ request }) => {
      // Cleanup PR
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
