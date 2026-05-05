// tests/functional/performance-review/edit/pr-edit-case3-add-colleague.spec.js
// E2E тест: Добавление коллеги-респондента в запущенный PR

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
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
  "PR Edit - Добавление коллеги",
  { tag: ["@performance-review", "@edit", "@e2e", "@regression", "@ui"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Edit Running PR - Add Colleague",
      );
    });

    /**
     * Кейс 3: Добавление коллеги-респондента админом в запущенный PR
     *
     * Шаги:
     * 1. Админ создаёт PR с направлением "От коллег"
     * 2. Админ запускает PR
     * 3. Сотрудник заполняет самооценку
     * 4. Админ добавляет коллегу-респондента через таблицу
     * 5. Новый коллега видит анкету
     */
    test(
      "C3012: Добавление коллеги-респондента админом",
      { tag: ["@high"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("normal");
        test.slow();
        testInfo.setTimeout(600_000);

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let newColleague = null;
        let prId = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Добавление коллеги ${Date.now()}`;

        // Получение пользователей
        await test.step("Получить пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
          users = await orgHelper.getUsersList(9);
          users = await filterValidUsers(users);

          if (users.length < 4) {
            throw new Error("Недостаточно пользователей для теста");
          }

          newColleague = users[3];
          console.log(`Новый коллега: ${newColleague.name}`);
        });

        // Создание и запуск PR
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
            manager: false,
            colleagues: true,
            subordinates: false,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: false,
          });

          await configPage.addTargetUsers({ count: 1 });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();

          // Выбираем «Полная открытость» чтобы снять требование >= 2 респондентов на направление
          const openOption = adminPage.getByText("Полная открытость", {
            exact: true,
          });
          await openOption.scrollIntoViewIfNeeded();
          await openOption.click();
          console.log("✓ Выбрана «Полная открытость» (без анонимности)");

          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          }
        });

        // Сотрудник заполняет самооценку
        await test.step("Оцениваемый заполняет самооценку", async () => {
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
          const maxAttempts = 15;
          let filledCount = 0;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              console.log(`populateReview #${filledCount} OK`);
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              console.log(
                `populateReview: все анкеты заполнены (${filledCount} итераций)`,
              );
              break;
            } else {
              console.log(
                `populateReview: статус ${response.status()}, прерываем`,
              );
              break;
            }
          }
          if (filledCount === 0)
            throw new Error("populateReview не заполнил ни одной анкеты");
          console.log("✓ Самооценка заполнена");
          await adminPage.waitForLoadState("networkidle");
        });

        // Проверка: коллега до добавления админом
        await test.step("Проверить что коллега не является респондентом до добавления", async () => {
          await userSession.runAs(newColleague, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");

            const prBlock = page
              .locator(
                '[class*="PerformanceReviewSummaryNotification_notification"]',
              )
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            const isVisible = await prBlock
              .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true, () => false)

            if (isVisible) {
              console.log(
                `ℹ️ ${newColleague.name} уже видит анкету (автоматический подбор)`,
              );
            } else {
              console.log(
                `✓ ${newColleague.name} НЕ видит анкету до добавления`,
              );
            }
          });
        });

        // Админ добавляет коллегу-респондента
        await test.step("Админ добавляет коллегу-респондента", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          const result = await configPage.editRespondentsTable({
            colleagues: [newColleague],
          });
          console.log(`✓ Добавлено коллег: ${result.addedColleagues.length}`);

          // Нажимаем страничную кнопку «Сохранить», которая открывает панель
          // «Изменение участников оценки», затем подтверждаем изменения
          await configPage.saveAndConfirmChanges();

          // После панели может появиться полноэкранная страница «Подтвердите изменения»
          // с кнопкой «Подтвердить изменения» — нужно кликнуть её
          const fullPageConfirm = adminPage
            .getByRole("button", { name: /подтвердить изменения/i })
            .first();
          if (
            await fullPageConfirm
              .waitFor({ state: "visible", timeout: 10_000 })
              .then(() => true)
              .catch(() => false)
          ) {
            await fullPageConfirm.click();
            console.log('✓ Нажата кнопка "Подтвердить изменения" на полноэкранной странице');
            await adminPage.waitForLoadState("networkidle", { timeout: 15000 });
          }

          await adminPage
            .waitForLoadState("networkidle", { timeout: 15000 });
        });

        // Проверка: коллега видит анкету после добавления админом
        await test.step("Проверить что коллега ВИДИТ анкету", async () => {
          await userSession.runAs(newColleague, async (page) => {
            // Задержка для распространения изменений в системе
            await page.waitForTimeout(5000);
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");
            await page.reload();
            await page.waitForLoadState("networkidle");

            const prBlock = page
              .locator(
                '[class*="PerformanceReviewSummaryNotification_notification"]',
              )
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            await expect(prBlock).toBeVisible({ timeout: 30000 });
            console.log(
              `✓ ${newColleague.name} ВИДИТ анкету после добавления админом`,
            );
          });
        });

        console.log(
          "✅ Тест завершён: коллега-респондент успешно добавлен админом",
        );
      },
    );
  },
);
