// tests/functional/performance-review/resume/pr-resume-basic-async-e2e.spec.js
// E2E тест: Базовый сценарий возобновления ASYNC оценки (earlyAccess: true)
// Проверяет видимость кнопок на каждом этапе: completed → resume → active → stop → completed

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
  "PR Resume - Базовый сценарий (async, ранний доступ)",
  { tag: ["@performance-review", "@resume", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume Basic Async");
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
     * Async PR (earlyAccess: true): кнопки видимости на каждом этапе
     *
     * Шаги:
     * 1. Создать async PR (ранний доступ к анкетам)
     * 2. Запустить → заполнить → завершить
     * 3. Проверить кнопки на completed
     * 4. Resume → проверить кнопки на active
     * 5. Повторно завершить → проверить кнопки на completed
     */
    test(
      "C7457: Кнопки возобновления и нового цикла на async PR (ранний доступ)",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Async Resume ${Date.now()}`;

        // --- Шаг 1: Создать и запустить async PR ---
        await test.step("Создать и запустить async PR (earlyAccess)", async () => {
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

          // Ключевая настройка: ранний доступ к анкетам (isAsyncSteps)
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            earlyAccess: true,
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

          // Проверить что PR действительно async
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: prData } = await prAPI.getById(prId);
          expect(
            prData.isAsyncSteps,
            "PR должен быть async (earlyAccess)",
          ).toBe(true);

          console.log(`✓ Async PR запущен, ID: ${prId}, isAsyncSteps: true`);
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
          await adminPage.waitForLoadState("networkidle");

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

          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          console.log("✓ Async PR завершён");
        });

        // --- Шаг 4: Проверить кнопки на completed async PR ---
        await test.step("Кнопки на завершённом async PR", async () => {
          // Должны быть видны
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
          await expect(resumeButton).toBeVisible();

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

          // НЕ должны быть видны
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

          console.log(
            "✓ Completed async: Возобновить ✅, Создать новый цикл ✅, Результаты ✅",
          );
        });

        // --- Шаг 5: Resume → проверить кнопки на active ---
        await test.step("Resume → кнопки на активном async PR", async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.click();

          const resumeModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /возобнов/i });
          await resumeModal.waitFor({ state: "visible", timeout: 5000 });
          await resumeModal.getByRole("button", { name: /^да/i }).click();

          await adminPage
            .getByText(/оценка запущена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          // Должны быть видны
          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await expect(finishButton).toBeVisible();

          // НЕ должны быть видны
          const resumeButtonGone = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButtonGone).not.toBeVisible();

          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButton).not.toBeVisible();

          const launchNewCycleGone = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await expect(launchNewCycleGone).not.toBeVisible();

          // Проверить что PR всё ещё async
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: prData } = await prAPI.getById(prId);
          expect(
            prData.isAsyncSteps,
            "isAsyncSteps сохранился после resume",
          ).toBe(true);

          console.log(
            "✓ Active async: Завершить ✅, остальные ❌, isAsyncSteps=true",
          );
        });

        // --- Шаг 6: Повторное завершение → кнопки на completed ---
        await test.step("Повторное завершение → кнопки на completed async PR", async () => {
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

          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          // Кнопки снова как на completed
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
          await expect(resumeButton).toBeVisible();

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

          console.log("✓ Повторное завершение async — все кнопки на месте");
        });
      },
    );
  },
);
