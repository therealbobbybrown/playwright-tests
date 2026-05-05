// tests/functional/performance-review/resume/pr-resume-basic-e2e.spec.js
// E2E тест: Базовый сценарий возобновления оценки (RESUME-001, RESUME-002, RESUME-006)

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";

test.describe(
  "PR Resume - Базовый сценарий",
  { tag: ["@performance-review", "@resume", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume Basic");
    });

    let createdReviewId = null;

    test.afterEach(async ({ request }) => {
      if (createdReviewId) {
        try {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          try {
            await prAPI.stop(createdReviewId);
          } catch {
            /* ignore */
          }
          try {
            await prAPI.archive(createdReviewId);
          } catch {
            /* ignore */
          }
          try {
            await prAPI.remove(createdReviewId);
          } catch {
            /* ignore */
          }
        } catch {
          /* ignore */
        }
        createdReviewId = null;
      }
    });

    /**
     * RESUME-001: Кнопка "Возобновить оценку" видна на завершённом PR
     * RESUME-002: Resume → статус "Активная"
     * RESUME-006: Повторное завершение → кнопка resume снова доступна
     *
     * Шаги:
     * 1. Создать PR с самооценкой + руководитель
     * 2. Запустить → заполнить → завершить
     * 3. Проверить кнопку "Возобновить оценку"
     * 4. Resume → проверить статус "Активная"
     * 5. Повторно завершить → проверить кнопку resume
     */
    test(
      "C7410: Кнопка возобновления видна, resume меняет статус на активный",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Resume Test ${Date.now()}`;

        // --- Шаг 1: Создать и запустить PR ---
        await test.step("Создать и запустить PR", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.fillTitle(prName);
          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });
          await configPage.addTargetUsers({ count: 2 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          expect(match).not.toBeNull();
          expect(match[1]).toMatch(/^\d+$/);
          prId = match[1];
          createdReviewId = prId;
          console.log(`✓ PR запущен, ID: ${prId}`);
        });

        // --- Шаг 2: Заполнить анкеты через API ---
        await test.step("Заполнить анкеты через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const populateSettings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 30; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              break;
            }
          }
          expect(filledCount).toBeGreaterThan(0);
          console.log(`✓ Заполнено анкет: ${filledCount}`);
        });

        // --- Шаг 3: Завершить PR ---
        await test.step("Завершить PR", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("domcontentloaded");

          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await finishButton.waitFor({ state: "visible", timeout: 15000 });
          await finishButton.click();

          await adminPage
            .getByText(/хотите завершить оценку/i)
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
          await adminPage
            .locator("button")
            .filter({ hasText: /^да/i })
            .first()
            .click();

          // Ждём статус "Завершена"
          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          console.log("✓ PR завершён");
        });

        // --- Шаг 4: RESUME-001 — Кнопка "Возобновить оценку" видна ---
        await test.step('RESUME-001: Кнопка "Возобновить оценку" видна', async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
          await expect(resumeButton).toBeVisible();
          console.log('✓ Кнопка "Возобновить оценку" видна');

          // Также проверяем наличие "Показать результаты" и "Создать новый цикл"
          const showResultsButton = adminPage
            .locator("button")
            .filter({ hasText: /показать результаты/i })
            .first();
          await expect(showResultsButton).toBeVisible();

          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButton).toBeVisible();

          // Кнопки, которых НЕ должно быть на завершённом PR
          const finishButtonGone = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await expect(finishButtonGone).not.toBeVisible();

          const launchNewCycleGone = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await expect(launchNewCycleGone).not.toBeVisible();
        });

        // --- Шаг 5: RESUME-002 — Нажать resume, проверить статус ---
        await test.step("RESUME-002: Resume → статус Активная", async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.click();

          // Подтвердить модалку "Хотите возобновить оценку?"
          const resumeModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /возобнов/i });
          await resumeModal.waitFor({ state: "visible", timeout: 5000 });
          await resumeModal.getByRole("button", { name: /^да/i }).click();

          // Ждём обновления статуса
          await adminPage
            .getByText(/оценка запущена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          // Кнопка "Завершить оценку" снова на месте
          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await expect(finishButton).toBeVisible();

          // Кнопка "Возобновить оценку" пропала
          const resumeButtonGone = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButtonGone).not.toBeVisible();

          // "Создать новый цикл" не видна после resume (только на завершённом PR)
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButton).not.toBeVisible();

          // "Запустить новый цикл" не видна на активном PR
          const launchNewCycleGone = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await expect(launchNewCycleGone).not.toBeVisible();

          console.log("✓ Resume выполнен, статус Активная");
        });

        // --- Шаг 6: RESUME-006 — Повторное завершение → resume снова доступен ---
        await test.step("RESUME-006: Повторное завершение → resume доступен", async () => {
          // Завершаем снова
          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await finishButton.click();

          await adminPage
            .getByText(/хотите завершить оценку/i)
            .first()
            .waitFor({ state: "visible", timeout: 5000 });
          await adminPage
            .locator("button")
            .filter({ hasText: /^да/i })
            .first()
            .click();

          // Ждём статус "Завершена"
          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          // Кнопка "Возобновить оценку" снова видна
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
          await expect(resumeButton).toBeVisible();

          // "Создать новый цикл" и "Показать результаты" тоже видны
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButton).toBeVisible();

          const showResultsButton = adminPage
            .locator("button")
            .filter({ hasText: /показать результаты/i })
            .first();
          await expect(showResultsButton).toBeVisible();

          console.log("✓ Повторное завершение — resume снова доступен");
        });
      },
    );
  },
);
