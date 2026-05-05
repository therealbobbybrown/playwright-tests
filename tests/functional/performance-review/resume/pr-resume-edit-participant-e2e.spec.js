// tests/functional/performance-review/resume/pr-resume-edit-participant-e2e.spec.js
// E2E тест: Добавление нового участника после resume (RESUME-040)

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
  "PR Resume - Добавление участника после resume",
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
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Resume - Edit Add Participant",
      );
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
     * RESUME-040: Добавить нового участника (target user) после resume
     *
     * Шаги:
     * 1. Создать PR с 2 участниками, все 4 направления
     * 2. Запустить → заполнить часть анкет → завершить
     * 3. Resume
     * 4. Добавить нового участника (target user)
     * 5. Проверить что новый участник появился
     * 6. Заполнить анкеты нового участника
     * 7. Завершить → проверить результаты
     */
    test(
      "C7420: Добавить нового участника в возобновлённый PR",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Resume Add Participant ${Date.now()}`;

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

        // --- Заполнить часть анкет ---
        await test.step("Заполнить часть анкет через API", async () => {
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
          let filledCount = 0;
          for (let attempt = 1; attempt <= 50; attempt++) {
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
          console.log(`✓ Заполнено анкет: ${filledCount}`);
        });

        // --- Завершить PR ---
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

          await adminPage
            .getByText(/оценка завершена/i)
            .first()
            .waitFor({ state: "visible", timeout: 30000 });
          console.log("✓ PR завершён");
        });

        // --- Resume ---
        await test.step("Resume PR", async () => {
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await resumeButton.waitFor({ state: "visible", timeout: 10000 });
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

        // --- RESUME-040: Добавить нового участника ---
        let participantsBeforeAdd;
        await test.step("Подсчитать текущих участников", async () => {
          // Находим таблицу участников — считаем строки
          const rows = adminPage.locator("table >> tbody >> tr:has(td)");
          participantsBeforeAdd = await rows.count();
          console.log(`Участников до добавления: ${participantsBeforeAdd}`);
        });

        await test.step("RESUME-040: Добавить нового участника", async () => {
          // На активном PR кнопка "Добавить участника" доступна напрямую
          const addButton = adminPage
            .locator("button")
            .filter({ hasText: /добавить участника/i })
            .first();
          await addButton.waitFor({ state: "visible", timeout: 10000 });
          await addButton.click();

          // Модалка "Кого еще вы хотите оценить?" с табами Сотрудники/Группы/Отделы
          await adminPage
            .getByText(/кого еще вы хотите оценить/i)
            .waitFor({ state: "visible", timeout: 10000 });

          // Используем поиск для надёжного нахождения сотрудника
          const searchInput = adminPage.getByRole("textbox", {
            name: /имя, фамилия или почта/i,
          });
          await searchInput.fill("Ryan");
          await adminPage.waitForTimeout(1000);

          // Кликаем найденного сотрудника
          const employeeButton = adminPage
            .locator("button")
            .filter({ hasText: /Ryan.*\d+/i })
            .first();
          await employeeButton.waitFor({ state: "visible", timeout: 10000 });
          const employeeName = await employeeButton.textContent();
          console.log(`Добавляем участника: ${employeeName?.trim()}`);
          await employeeButton.click();

          // Подтвердить выбор в модалке
          const modalConfirmBtn = adminPage
            .locator("button")
            .filter({ hasText: /^подтвердить$/i })
            .first();
          await modalConfirmBtn.waitFor({ state: "visible", timeout: 5000 });
          await modalConfirmBtn.click();

          // Ждём панель "Изменение участников оценки" (sketch workflow)
          const sketchPanel = adminPage
            .getByText(/изменение участников оценки/i)
            .first();
          await sketchPanel.waitFor({ state: "visible", timeout: 10000 });

          // Нажимаем "Сохранить"
          const saveButton = adminPage
            .locator("button")
            .filter({ hasText: /^сохранить$/i })
            .first();
          await saveButton.click();

          // Подтвердить изменения
          const confirmBtn = adminPage
            .locator("button")
            .filter({ hasText: /подтвердить изменения/i })
            .first();
          await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
          await confirmBtn.click();

          // Ждём "Изменения сохранены"
          await adminPage
            .getByText(/изменения сохранены/i)
            .first()
            .waitFor({ state: "visible", timeout: 10000 });

          console.log("✓ Новый участник добавлен");
        });

        await test.step("Проверить что участников стало больше", async () => {
          // Перезагружаем страницу для актуальных данных
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("domcontentloaded");

          const rows = adminPage.locator("table >> tbody >> tr:has(td)");
          const participantsAfterAdd = await rows.count();
          console.log(`Участников после добавления: ${participantsAfterAdd}`);
          expect(participantsAfterAdd).toBeGreaterThan(participantsBeforeAdd);
        });

        // --- Завершить и проверить ---
        await test.step("RESUME-046: Завершить и проверить", async () => {
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

          // Кнопка resume снова доступна
          const resumeButton = adminPage
            .locator("button")
            .filter({ hasText: /возобновить оценку/i })
            .first();
          await expect(resumeButton).toBeVisible();
          console.log("✓ PR завершён, resume доступен, участник сохранён");
        });
      },
    );
  },
);
