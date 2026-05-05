// tests/functional/performance-review/resume/pr-resume-completed-readonly-e2e.spec.js
// E2E тест: Завершённый PR — редактирование заблокировано на фронте.
// После "Создать новый цикл" — редактирование доступно, resume недоступен.

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
  "PR Resume — Readonly на завершённом, редактирование после нового цикла",
  {
    tag: [
      "@performance-review",
      "@resume",
      "@edit",
      "@e2e",
      "@regression",
      "@ui",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume Completed Readonly");
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

    test(
      "C7455: Завершённый PR: контролы disabled; после нового цикла: enabled, resume нет",
      { tag: ["@high"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Readonly Test ${Date.now()}`;

        // --- Создать, запустить, заполнить, завершить PR ---
        await test.step("Создать, запустить, заполнить, завершить PR", async () => {
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
          expect(match).toBeTruthy();
          prId = match[1];
          createdReviewId = prId;

          // Заполнить через API
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const settings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filled = 0;
          for (let i = 0; i < 30; i++) {
            const { response } = await prAPI.populateReview(prId, settings, {
              timeout: 120000,
            });
            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              break;
            }
          }
          expect(filled).toBeGreaterThan(0);

          // Завершить
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
          await finishButton.waitFor({
            state: "visible",
            timeout: 15000,
          });
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

          console.log(`✓ PR ${prId} создан и завершён`);
        });

        // --- Проверка: редактирование ЗАБЛОКИРОВАНО на завершённом PR ---
        await test.step("Завершённый PR: контролы редактирования заблокированы", async () => {
          // Перезагрузим для чистого состояния
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Статусная подсказка на завершённом PR
          const completedHint = adminPage
            .getByText(/оценка завершена/i)
            .first();
          await expect(completedHint).toBeVisible({ timeout: 10000 });

          // "Добавить участника" — disabled или не видна
          const addParticipantBtn = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          const addBtnVisible = await addParticipantBtn.isVisible();

          if (addBtnVisible) {
            const isDisabled = await addParticipantBtn.isDisabled();
            expect(
              isDisabled,
              '"Добавить участника" должна быть disabled на завершённом PR',
            ).toBe(true);
            console.log('✓ "Добавить участника" — disabled');
          } else {
            console.log('✓ "Добавить участника" — не видна (скрыта)');
          }

          // Кнопки на завершённом PR: все три видны
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButton).toBeVisible({ timeout: 5000 });

          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).toBeVisible();

          const resultsButton = adminPage
            .locator("button")
            .filter({ hasText: /показать результаты/i })
            .first();
          await expect(resultsButton).toBeVisible();

          console.log(
            "✓ Завершённый PR: контролы disabled, все 3 кнопки видны",
          );
        });

        // --- "Создать новый цикл" → черновик ---
        await test.step("Создать новый цикл → подтвердить модалку", async () => {
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await newCycleButton.click();

          const newCycleModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /создать новый цикл/i });
          await newCycleModal.waitFor({
            state: "visible",
            timeout: 5000,
          });
          await newCycleModal.getByRole("button", { name: /^да/i }).click();

          await adminPage.waitForLoadState("networkidle");
          console.log("✓ Модалка подтверждена, новый цикл создан");
        });

        // --- Проверка: редактирование ДОСТУПНО после нового цикла ---
        await test.step("Новый цикл: редактирование доступно, resume нет", async () => {
          // "Запустить новый цикл" видна
          const launchButton = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await launchButton.waitFor({
            state: "visible",
            timeout: 15000,
          });

          // "Возобновить оценку" НЕ видна
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).not.toBeVisible();

          // Подсказка "Оценка завершена" должна исчезнуть после нового цикла
          const completedHint = adminPage
            .getByText(/оценка завершена/i)
            .first();
          await expect(completedHint).not.toBeVisible();

          // "Добавить участника" — доступна (enabled)
          const addParticipantBtn = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          const addBtnVisible = await addParticipantBtn.isVisible();

          if (addBtnVisible) {
            const isEnabled = await addParticipantBtn.isEnabled();
            expect(
              isEnabled,
              '"Добавить участника" должна быть enabled после нового цикла',
            ).toBe(true);
            console.log('✓ "Добавить участника" — enabled');
          }

          // "Показать результаты" всё ещё видна
          const resultsButton = adminPage
            .locator("button")
            .filter({ hasText: /показать результаты/i })
            .first();
          await expect(resultsButton).toBeVisible();

          console.log(
            "✓ Новый цикл: контролы enabled, resume нет, запуск доступен",
          );
        });
      },
    );
  },
);
