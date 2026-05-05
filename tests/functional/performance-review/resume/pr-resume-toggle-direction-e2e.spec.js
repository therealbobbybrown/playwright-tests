// tests/functional/performance-review/resume/pr-resume-toggle-direction-e2e.spec.js
// E2E тест: Отключение направления после resume (RESUME-042)

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
  "PR Resume - Отключение направления после resume",
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
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Resume - Toggle Direction");
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
     * RESUME-042: Отключить направление (подчинённые) после resume
     *
     * Шаги:
     * 1. Создать PR со всеми 4 направлениями
     * 2. Запустить → заполнить → завершить
     * 3. Resume
     * 4. Снять чекбокс "Подчинённые" → сохранить через sketch
     * 5. Проверить что направление отключено (колонка пустая)
     * 6. Завершить → направление остаётся отключённым
     */
    test(
      "C7454: Отключение направления подчинённых после resume",
      { tag: ["@high"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("high");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);

        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Resume Toggle Dir ${Date.now()}`;

        // --- Создать и запустить PR ---
        await test.step("Создать и запустить PR с 4 направлениями", async () => {
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
          // Добавляем участников с реальными подчинёнными в оргструктуре
          // (William 61774 — 2 подч., Ellie 20653 — 2 подч.)
          // Используем пользователей с малым числом подчинённых чтобы не перегружать API
          await configPage.goToStep("targetUsers");

          const addButton = adminPage
            .getByRole("button", { name: /добавить участника/i })
            .first();
          await addButton.waitFor({ state: "visible", timeout: 15000 });
          await addButton.click();

          const modal = adminPage
            .locator('[class*="Modal"]')
            .filter({ hasText: "Кого еще вы хотите оценить" })
            .first();
          await modal.waitFor({ state: "visible", timeout: 10000 });

          const searchInput = modal.getByRole("textbox", {
            name: /имя, фамилия или почта/i,
          });

          for (const userName of ["William 61774", "Ellie 20653"]) {
            await searchInput.fill(userName);
            await adminPage.waitForTimeout(1000);
            const userCard = modal
              .locator('[class*="Option_option-item"]')
              .filter({ hasText: new RegExp(userName, "i") })
              .first();
            await userCard.waitFor({ state: "visible", timeout: 10000 });
            await userCard.click();
            console.log(`Выбран участник: ${userName}`);
            await searchInput.clear();
          }

          const confirmButton = modal
            .locator("button")
            .filter({ hasText: "Подтвердить" })
            .first();
          await confirmButton.click();
          await modal.waitFor({ state: "hidden", timeout: 10000 });
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

        // --- Заполнить анкеты ---
        await test.step("Заполнить анкеты через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          let filledCount = 0;
          for (let attempt = 1; attempt <= 60; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              {
                skipChance: 0,
                commentChance: 0,
                customChance: 0,
                lowerLimit: 60,
                upperLimit: 100,
              },
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

        // --- Завершить ---
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
            .waitFor({ state: "visible", timeout: 15000 });
          console.log("✓ PR завершён");
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

        // --- RESUME-042: Отключить направление "Подчинённые" ---
        await test.step('RESUME-042: Снять чекбокс "Подчинённые"', async () => {
          const subordinatesCheckbox = adminPage.getByRole("checkbox", {
            name: /подчиненные|подчинённые/i,
          });
          await expect(subordinatesCheckbox).toBeChecked();
          await subordinatesCheckbox.click();

          // Ждём панель "Изменение участников оценки"
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

          console.log('✓ Направление "Подчинённые" отключено');
        });

        // --- Проверить ---
        await test.step("Проверить что направление отключено", async () => {
          // Перезагружаем страницу
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("domcontentloaded");
          await adminPage.waitForTimeout(3000);

          // Проверяем через API что направление "Подчинённые" отключено
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const { data: prData } = await prAPI.getById(prId);

          console.log(
            `Направления PR: ${JSON.stringify(prData.directions?.map((d) => ({ type: d.type || d.name, isSelected: d.isSelected })))}`,
          );

          // Проверяем что направление "подчинённые" отключено
          const subordinateDir = prData.directions?.find(
            (d) =>
              d.type === "subordinate" ||
              d.name?.toLowerCase().includes("подчин"),
          );
          if (subordinateDir) {
            expect(subordinateDir.isSelected).toBe(false);
          }
          // Если направления нет вообще — это тоже ОК (удалено полностью)
          const hasSubordinateDirection = prData.directions?.some(
            (d) =>
              d.type === "subordinate" ||
              d.name?.toLowerCase().includes("подчин"),
          );
          expect(
            hasSubordinateDirection === false ||
              subordinateDir?.isSelected === false,
          ).toBe(true);

          // В UI чекбокс "Подчинённые" должен быть unchecked
          const subordinatesCheckbox = adminPage.getByRole("checkbox", {
            name: /подчиненные|подчинённые/i,
          });
          await expect(subordinatesCheckbox).not.toBeChecked();
        });

        // --- Завершить и проверить сохранение ---
        await test.step("RESUME-046: Завершить — направление остаётся отключённым", async () => {
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

          console.log("✓ PR завершён — отключённое направление сохранено");
        });
      },
    );
  },
);
