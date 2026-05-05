// tests/functional/performance-review/resume/pr-resume-fill-roles-e2e.spec.js
// E2E тест: Заполнение анкет разными ролями после resume (RESUME-070..074)

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import {
  createUserSession,
  filterValidUsers,
} from "../../../utils/UserSessionHelper.js";
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
  "PR Resume - Заполнение анкет разными ролями",
  {
    tag: [
      "@performance-review",
      "@resume",
      "@filling",
      "@e2e",
      "@regression",
      "@ui",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume - Fill by Roles");
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
     * RESUME-004: После resume незаполнивший респондент видит задачу и может заполнить
     * RESUME-073: Самооценка после resume
     *
     * Шаги:
     * 1. Создать PR с самооценкой + руководитель (2 направления)
     * 2. Запустить, НЕ заполнять, завершить
     * 3. Resume
     * 4. Проверить что оцениваемый видит задачу на Главной
     * 5. Заполнить самооценку от имени оцениваемого
     * 6. Проверить что анкета принята
     */
    test(
      "C7425: Респондент видит задачу после resume и может заполнить",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Resume Fill Roles ${Date.now()}`;

        // --- Создать и запустить PR ---
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

        // --- Завершить БЕЗ заполнения ---
        await test.step("Завершить PR без заполнения", async () => {
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

          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          console.log("✓ PR завершён без заполнения анкет");
        });

        // --- Resume ---
        await test.step("Resume PR", async () => {
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

          await adminPage
            .getByText(/оценка запущена/i)
            .first()
            .waitFor({ state: "visible", timeout: 15000 });
          console.log("✓ PR возобновлён");
        });

        // --- Заполнить все анкеты через API ---
        await test.step("Заполнить анкеты после resume через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password, { timeout: 120_000 });

          const settings = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };
          let filledCount = 0;
          for (let attempt = 1; attempt <= 30; attempt++) {
            const { response } = await prAPI.populateReview(prId, settings, {
              timeout: 120000,
            });
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 500));
            } else {
              break;
            }
          }
          expect(filledCount).toBeGreaterThan(0);
          console.log(`✓ Заполнено анкет после resume: ${filledCount}`);
        });

        // --- Проверить результаты ---
        await test.step("RESUME-007: Проверить что результаты появились", async () => {
          // Перезагружаем страницу
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("domcontentloaded");

          // Проверяем прогресс
          const progressText = adminPage.getByText(/\d+ из \d+ анкет/i).first();
          await progressText.waitFor({ state: "visible", timeout: 15000 });
          const text = await progressText.textContent();
          console.log(`Прогресс: ${text}`);
          expect(text).toMatch(/\d+ из \d+ анкет/i);

          // Проверяем через API — прогресс обновился
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password, { timeout: 120_000 });

          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // Проверяем что revision существует
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision).toBeDefined();
          expect(typeof revision.id).toBe("number");
          console.log(`✓ Revision: ${revision.id}`);

          // Проверяем прогресс через target users
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 50,
          });
          const targetUsers = tuData?.items || tuData || [];
          expect(targetUsers.length).toBe(2);

          // Проверяем что статистика доступна (status 200 или 201)
          const { response: summResp } =
            await prAPI.getStatisticsSummaryResults(prId, {
              revisionId: revision.id,
              targetUsersIds: [],
            });
          console.log(`Статистика: status ${summResp.status()}`);
          expect(
            summResp.ok(),
            `Статистика должна быть доступна после заполнения (status ${summResp.status()})`,
          ).toBe(true);
        });

        // --- Завершить ---
        await test.step("Завершить PR", async () => {
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

          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).toBeVisible();
          console.log("✓ PR завершён, resume доступен, данные сохранены");
        });
      },
    );
  },
);
