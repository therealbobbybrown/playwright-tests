// tests/functional/performance-review/resume/pr-resume-confirm-cancel-e2e.spec.js
// E2E тест: Модалки подтверждения — точные тексты, отмена не меняет статус
// Завершение: "Хотите завершить оценку?" → "Да" / Resume: "Хотите возобновить оценку?" → "Да"

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
  "PR Resume — Confirm & Cancel Modals",
  { tag: ["@performance-review", "@resume", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume Confirm Cancel");
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
      "C7413: Отмена завершения и возобновления не меняет статус, подтверждение работает",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Cancel Modal ${Date.now()}`;

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

        await test.step("Заполнить анкеты через API", async () => {
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
          console.log(`✓ Заполнено: ${filled}`);
        });

        // --- Шаг 1: Отмена завершения ---
        await test.step("Нажать 'Завершить' → модалка → 'Нет' → PR остался активным", async () => {
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

          // Модалка подтверждения завершения
          const finishModalText = adminPage
            .getByText(/хотите завершить оценку/i)
            .first();
          await finishModalText.waitFor({ state: "visible", timeout: 5000 });

          // Тексты модалки завершения (DEVAPR-11570)
          await expect(
            adminPage.getByText(/приём новых ответов будет остановлен/i),
          ).toBeVisible();
          await expect(
            adminPage.getByText(
              /незавершённые анкеты станут недоступны для заполнения/i,
            ),
          ).toBeVisible();

          // Кнопка "Да" видна
          await expect(
            adminPage.locator("button").filter({ hasText: /^да/i }).first(),
          ).toBeVisible();

          // Нажать "Отмена" / "Нет" для отмены
          await adminPage
            .locator("button")
            .filter({ hasText: /отмена|^нет$/i })
            .first()
            .click();

          await finishModalText.waitFor({ state: "hidden", timeout: 5000 });

          // PR всё ещё активен
          await expect(finishButton).toBeVisible();
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).not.toBeVisible();

          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");
          console.log("✓ Отмена завершения — PR остался active");
        });

        // --- Шаг 2: Подтверждение завершения ---
        await test.step("Нажать 'Завершить' → 'Да' → PR завершён", async () => {
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
          console.log("✓ PR завершён");
        });

        // --- Шаг 3: Отмена возобновления ---
        await test.step("Нажать 'Возобновить' → модалка 'Хотите возобновить?' → 'Нет'", async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
          await resumeButton.click();

          // Модалка возобновления оценки
          const resumeModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /возобнов/i });
          await resumeModal.waitFor({ state: "visible", timeout: 5000 });

          // Тексты модалки возобновления (DEVAPR-11754)
          await expect(
            resumeModal.getByText(
              /оценка будет возобновлена с настройками последнего завершённого цикла/i,
            ),
          ).toBeVisible();
          await expect(
            resumeModal.getByText(
              /дособрать ответы от сотрудников/i,
            ),
          ).toBeVisible();
          await expect(
            resumeModal.getByText(
              /остальные уведомления по расписанию отправляться не будут/i,
            ),
          ).toBeVisible();

          // Кнопка "Да" видна
          await expect(
            resumeModal.getByRole("button", { name: /^да/i }),
          ).toBeVisible();

          // Нажать "Нет" / "Отмена" для отмены
          await resumeModal
            .getByRole("button", { name: /отмена|^нет$/i })
            .click();

          // Модалка закрылась
          await resumeModal.waitFor({ state: "hidden", timeout: 5000 });

          // PR остался завершённым — кнопка resume всё ещё видна
          await expect(resumeButton).toBeVisible();

          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: prData } = await prAPI.getById(prId);
          expect(["stopped", "complete"]).toContain(prData.status);
          console.log("✓ Отмена возобновления — PR остался завершённым");
        });

        // --- Шаг 4: Подтверждение возобновления ---
        await test.step("Нажать 'Возобновить' → 'Да' → PR активный", async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.click();

          // Модалка возобновления оценки
          const resumeModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /возобнов/i });
          await resumeModal.waitFor({ state: "visible", timeout: 5000 });
          await resumeModal.getByRole("button", { name: /^да/i }).click();

          // Ждём "Оценка запущена"
          await adminPage
            .getByText(/оценка запущена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });

          // Кнопка "Завершить" появилась, "Возобновить" пропала
          const finishButton = adminPage
            .locator("button")
            .filter({ hasText: /завершить оценку/i })
            .first();
          await expect(finishButton).toBeVisible();

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

          console.log("✓ Возобновление подтверждено — PR активный");
        });
      },
    );
  },
);
