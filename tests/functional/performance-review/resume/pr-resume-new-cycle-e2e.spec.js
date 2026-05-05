// tests/functional/performance-review/resume/pr-resume-new-cycle-e2e.spec.js
// E2E тест: "Создать новый цикл" — кнопка видна, клик создаёт новый цикл,
// resume доступен только для последнего цикла

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
import { assertSuccessStatus } from "../../../utils/api/common-assertions.js";

test.describe(
  "PR Resume — New Cycle",
  { tag: ["@performance-review", "@resume", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume New Cycle");
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
      "C7432: Создать новый цикл → PR перезапускается, предыдущий revision сохранён",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        let firstRevisionId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `New Cycle ${Date.now()}`;

        await test.step("Создать, запустить, заполнить, завершить PR", async () => {
          // Создать PR
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
          for (let i = 0; i < 30; i++) {
            const { response } = await prAPI.populateReview(prId, settings, {
              timeout: 120000,
            });
            if (!response.ok()) break;
            await new Promise((r) => setTimeout(r, 500));
          }

          // Зафиксировать revision первого цикла
          const { data: revision } = await prAPI.getLastRevision(prId);
          expect(revision).toBeDefined();
          expect(typeof revision.id).toBe("number");
          firstRevisionId = revision.id;
          expect(firstRevisionId).toBeGreaterThan(0);

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

          console.log(
            `✓ PR ${prId} создан и завершён, revision: ${firstRevisionId}`,
          );
        });

        await test.step('Кнопка "Создать новый цикл" видна на завершённом PR', async () => {
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await newCycleButton.waitFor({ state: "visible", timeout: 10000 });
          await expect(newCycleButton).toBeVisible();

          // Кнопки resume и показать результаты тоже видны
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

          console.log(
            '✓ Все три кнопки видны: "Создать новый цикл", "Возобновить", "Результаты"',
          );
        });

        await test.step("Нажать 'Создать новый цикл' → подтвердить модалку", async () => {
          const newCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await newCycleButton.click();

          // Модалка подтверждения
          const newCycleModal = adminPage
            .getByRole("dialog")
            .filter({ hasText: /создать новый цикл/i });
          await newCycleModal.waitFor({ state: "visible", timeout: 5000 });

          // Тексты модалки нового цикла (DEVAPR-11570)
          await expect(
            newCycleModal.getByText(/будет запущена новая итерация оценки/i),
          ).toBeVisible();
          await expect(
            newCycleModal.getByText(
              /данные предыдущего цикла останутся без изменений/i,
            ),
          ).toBeVisible();
          await expect(
            newCycleModal.getByText(
              /возможность возобновить предыдущий цикл оценки станет недоступной/i,
            ),
          ).toBeVisible();

          // Нажать "Да" в модалке "Создать новый цикл"
          await newCycleModal.getByRole("button", { name: /^да/i }).click();

          // PR НЕ запускается автоматически — переходит в черновик нового цикла
          await adminPage.waitForLoadState("networkidle");
          console.log("✓ Модалка подтверждена, новый цикл создан (черновик)");
        });

        await test.step("Черновик нового цикла: 'Запустить новый цикл' видна, 'Возобновить' — нет", async () => {
          // Кнопка запуска нового цикла видна
          const launchNewCycleButton = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await launchNewCycleButton.waitFor({
            state: "visible",
            timeout: 15000,
          });

          // "Возобновить оценку" НЕ должна быть видна (новый цикл заменяет resume)
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).not.toBeVisible();

          // "Создать новый цикл" НЕ должна быть видна (уже создан)
          const newCycleButtonGone = adminPage
            .locator("button")
            .filter({ hasText: /создать новый цикл/i })
            .first();
          await expect(newCycleButtonGone).not.toBeVisible();

          // "Показать результаты" всё ещё видна
          const resultsButton = adminPage
            .locator("button")
            .filter({ hasText: /показать результаты/i })
            .first();
          await expect(resultsButton).toBeVisible();

          console.log(
            '✓ Черновик: "Запустить новый цикл" видна, "Возобновить" и "Создать новый цикл" — нет',
          );
        });

        await test.step("Запустить новый цикл", async () => {
          const launchButton = adminPage
            .locator("button")
            .filter({ hasText: /запустить новый цикл/i })
            .first();
          await launchButton.click();

          // Модалка подтверждения запуска (может появиться)
          try {
            const confirmDialog = adminPage.getByRole("dialog");
            await confirmDialog.waitFor({ state: "visible", timeout: 5000 });
            await confirmDialog.getByRole("button", { name: /^да/i }).click();
          } catch {
            // Запуск без модалки подтверждения
          }

          // Кнопка "Отправить анкеты" может появиться после запуска
          const sendButton = adminPage
            .locator("button")
            .filter({ hasText: /отправить анкеты/i })
            .first();
          try {
            await sendButton.waitFor({ state: "visible", timeout: 5000 });
            await sendButton.click();
            try {
              const sendConfirm = adminPage.getByRole("dialog");
              await sendConfirm.waitFor({
                state: "visible",
                timeout: 3000,
              });
              await sendConfirm.getByRole("button", { name: /^да/i }).click();
            } catch {
              /* нет подтверждения отправки */
            }
          } catch {
            // Анкеты отправлены автоматически
          }

          await adminPage.waitForLoadState("networkidle");
          console.log("✓ Новый цикл запущен");
        });

        await test.step("Проверить через API: PR активен, настройки и revision сохранены", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // PR должен быть active после запуска
          const { data: prData } = await prAPI.getById(prId);
          expect(prData.status).toBe("active");

          // Анкеты сохранились от предыдущего цикла
          const { data: assessments } = await prAPI.getAssessments(prId);
          expect(assessments).toBeDefined();
          expect(typeof assessments).toBe("object");
          let totalAssessments = 0;
          const assessmentNames = [];
          for (const key of Object.keys(assessments)) {
            const value = assessments[key];
            if (Array.isArray(value)) {
              totalAssessments += value.length;
              value.forEach((a) =>
                assessmentNames.push(a.title || a.name || a.id),
              );
            }
          }
          expect(
            totalAssessments,
            "Анкеты должны сохраниться от предыдущего цикла",
          ).toBeGreaterThan(0);
          console.log(
            `✓ Анкеты сохранены: ${totalAssessments} шт. (${assessmentNames.join(", ")})`,
          );

          // Направления сохранены
          const directions = prData.directions || [];
          expect(
            directions.length,
            "Направления должны сохраниться от предыдущего цикла",
          ).toBeGreaterThan(0);
          console.log(`✓ Направления сохранены: ${directions.length} шт.`);

          // Участники сохранены
          const { data: tuData } = await prAPI.getTargetUsers(prId, {
            limit: 50,
          });
          const targetUsers = tuData?.items || tuData || [];
          expect(targetUsers.length).toBe(2);
          console.log(`✓ Участники сохранены: ${targetUsers.length}`);

          // Последний revision должен быть ДРУГИМ
          const { data: newRevision } = await prAPI.getLastRevision(prId);
          expect(newRevision).toBeDefined();
          expect(typeof newRevision.id).toBe("number");
          const newRevisionId = newRevision.id;
          expect(newRevisionId).toBeGreaterThan(0);

          expect(
            newRevisionId,
            "Новый цикл должен создать новый revision",
          ).not.toBe(firstRevisionId);

          // Данные первого цикла доступны по firstRevisionId
          const { response: summResp } =
            await prAPI.getStatisticsSummaryResults(prId, {
              targetUsersIds: [],
              revisionId: firstRevisionId,
            });
          expect(
            summResp.ok(),
            `Данные первого цикла должны быть доступны (status ${summResp.status()})`,
          ).toBe(true);

          console.log("✓ Новый цикл запущен, настройки и revision сохранены");
        });
      },
    );
  },
);
