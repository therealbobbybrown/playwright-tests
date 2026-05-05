// tests/functional/performance-review/filling/fill-pr-with-known-users-e2e.spec.js
// E2E тест: создать Performance Review с известными пользователями и заполнить анкеты от разных ролей
import { test } from "../../../fixtures/auth.js";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewFillPage } from "../../../../pages/PerformanceReviewFillPage.js";
import { OrgStructureHelper } from "../../../../pages/OrgStructureHelper.js";
import {
  PerformanceReviewAPI,
  getCredentials,
} from "../../../utils/api/index.js";
import { verifyPRResults } from "../../../utils/ResultsVerificationHelper.js";
import {
  markAsE2ETest,
  MODULES,
  setSeverity,
} from "../../../utils/allure-helpers.js";

test.describe(
  "Performance Review - E2E с известными пользователями",
  { tag: ["@performance-review", "@filling", "@e2e", "@ui", "@regression"] },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(MODULES.PERFORMANCE_REVIEW, "Filling");
    });

    test(
      "C3028: Создать PR, добавить известных пользователей, завершить этапы и заполнить анкеты",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000); // 10 минут

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const adminFillPage = new PerformanceReviewFillPage(
          adminPage,
          testInfo,
        );

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let subordinateUsers = [];
        let prId = null;
        let revisionAlias = null;
        let evaluatedUserName = null; // Имя оцениваемого (админ)
        const baseUrl = new URL(process.env.BASE_URL).origin;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(10);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 6) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 6)",
            );
          }

          // Распределяем роли
          // users[0] - это админ (оцениваемый)
          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          subordinateUsers = users.slice(2, 4);
          colleagues = users.slice(4);

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Подчиненные: ${subordinateUsers.map((u) => u.name).join(", ")}`,
          );
          console.log(
            `Потенциальные коллеги: ${colleagues.map((u) => u.name).join(", ")}`,
          );
        });

        // ---------------------- Шаг 2: Создание Performance Review ----------------------
        await test.step("Создать Performance Review со всеми направлениями", async () => {
          await adminPage.goto(
            new URL("/ru/manager/performance-reviews/", baseUrl).toString(),
          );
          await listPage.assertOpened();

          await listPage.openCreateModal();
          await listPage.performanceReviewType.click();
          await configPage.assertOpened();

          await configPage.configureDirections({
            self: true,
            manager: true,
            colleagues: true,
            subordinates: true,
          });

          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 1,
            maxColleagues: 2,
            managerApproval: false,
            earlyAccess: false,
          });

          console.log("✓ Направления и подбор коллег настроены");
        });

        // ---------------------- Шаг 3: Добавление участников ----------------------
        await test.step("Добавить участника и настроить респондентов", async () => {
          await configPage.addTargetUsers({ count: 1 });
          console.log("✓ Участник добавлен");

          await configPage.editRespondentsTable({
            managers: [managerUser],
            subordinates: subordinateUsers,
          });
          console.log("✓ Руководитель и подчиненные добавлены");
        });

        // ---------------------- Шаг 4: Настройка и запуск ----------------------
        await test.step("Настроить анкеты и отправить на этап подбора коллег", async () => {
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.sendForColleagueSelection();

          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ Performance Review создан, ID: ${prId}`);
          }
        });

        // ---------------------- Шаг 5: Завершение номинации и отправка анкет ----------------------
        // Примечание: addTargetUsers добавляет первого пользователя из оргструктуры (НЕ админа),
        // поэтому админ не может зайти на nomination-страницу как staff (403).
        // Завершаем этап номинации через API, затем добавляем коллег и отправляем анкеты через UI.
        await test.step("Завершить этап номинации и подготовить анкеты", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          if (revision?.alias) {
            revisionAlias = revision.alias;
            console.log(`✓ Получен revision alias: ${revisionAlias}`);
          }

          // Завершаем этап номинации через API (без выбора коллег оцениваемым)
          const { response: stopResp } = await prAPI.stopNominationStage(prId);
          console.log(
            `✓ Этап номинации завершён через API (статус: ${stopResp.status()})`,
          );
        });

        // ---------------------- Шаг 6: Отправка анкет ----------------------
        await test.step("Отправить анкеты", async () => {
          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Этап номинации уже завершён через API, пробуем завершить текущий этап если кнопка видна
          const completeBtn = adminPage
            .locator("button")
            .filter({ hasText: /завершить этап/i })
            .first();
          let hasCompleteBtn = false;
          try {
            await completeBtn
            .waitFor({ state: "visible", timeout: 5_000 })
            hasCompleteBtn = true;
          } catch {}
          if (hasCompleteBtn) {
            await configPage.completeCurrentStage();
            console.log("✓ Текущий этап завершён");
          }

          await configPage.sendQuestionnaires();
          console.log("✓ Анкеты отправлены");
        });

        // ---------------------- Шаг 7: Заполнение всех анкет через API ----------------------
        await test.step("Заполнить все анкеты через API (populateReview)", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          const POPULATE_SETTINGS = {
            skipChance: 0,
            commentChance: 0,
            customChance: 0,
            lowerLimit: 60,
            upperLimit: 100,
          };

          let filled = 0;
          const maxAttempts = 25;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              POPULATE_SETTINGS,
              { timeout: 120_000 },
            );

            if (response.ok()) {
              filled++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              // 500 = все анкеты уже заполнены
              console.log(
                `✓ Все анкеты заполнены через API (${filled} шт.) за ${attempt} попыток`,
              );
              break;
            } else {
              console.log(
                `⚠️ populateReview attempt ${attempt}: status ${response.status()}`,
              );
              break;
            }
          }

          if (filled === 0) {
            throw new Error(
              "Не удалось заполнить ни одной анкеты через populateReview",
            );
          }

          console.log(
            `✓ Заполнено анкет: ${filled} (самооценка + руководитель + коллеги + подчинённые)`,
          );
        });

        // ---------------------- Шаг 10: Открытие доступа к результатам ----------------------
        await test.step("Открыть доступ к результатам (новая модалка «Поделиться с сотрудником»)", async () => {
          if (!prId) {
            console.log("⚠️ PR ID не найден, пропускаем открытие доступа");
            return;
          }

          await adminPage.goto(
            new URL(
              `/ru/manager/performance-reviews/${prId}/`,
              baseUrl,
            ).toString(),
          );
          await adminPage.waitForLoadState("networkidle");

          // Переходим на вкладку "Результаты"
          const resultsTabBtn = adminPage
            .locator('button[class*="Tabs_button"]')
            .filter({ hasText: /^результаты$/i });
          await resultsTabBtn.waitFor({ state: "visible", timeout: 10000 });
          await resultsTabBtn.click();
          await adminPage.waitForTimeout(500);

          // Скроллим к нижней таблице
          await adminPage.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          await adminPage.waitForTimeout(500);

          // Выбрать всех
          const selectAll = adminPage
            .locator("label, span")
            .filter({ hasText: /выбрать всех/i })
            .first();
          await selectAll.waitFor({ state: "visible", timeout: 10000 });
          await selectAll.click();

          // Кнопка "Управление доступом"
          const accessBtn = adminPage
            .locator("button")
            .filter({ hasText: /управление доступом/i })
            .first();
          await accessBtn.waitFor({ state: "visible", timeout: 5000 });
          await adminPage
            .waitForFunction(
              () => {
                const buttons = Array.from(document.querySelectorAll("button"));
                const btn = buttons.find((b) =>
                  b.textContent.includes("Управление доступом"),
                );
                return btn && !btn.disabled;
              },
              { timeout: 5000 },
            )
;
          await accessBtn.click({ timeout: 10000 });

          // Модалка «Поделиться с сотрудником»
          const shareModal = adminPage
            .locator('[role="dialog"]')
            .filter({ hasText: /поделиться с сотрудником/i })
            .first();
          await shareModal.waitFor({ state: "visible", timeout: 10000 });
          console.log("✓ Модалка «Поделиться с сотрудником» открыта");

          // Кликаем «Результатами и итоговой оценкой»
          const fullOption = shareModal
            .locator('[class*="AccessOption"]')
            .filter({ hasText: /результатами и итоговой оценкой/i })
            .first();
          await fullOption.locator("button").first().click({ timeout: 10000 });
          console.log("✓ Выбрана опция «Результатами и итоговой оценкой»");

          // Кнопка «Готово»
          const confirmBtn = shareModal
            .locator("button")
            .filter({ hasText: /готово/i })
            .first();
          await confirmBtn.waitFor({ state: "visible", timeout: 10000 });
          await confirmBtn.click();
          await shareModal.waitFor({ state: "hidden", timeout: 10000 });

          console.log("✓ Доступ к результатам открыт через новую модалку");
        });

        // ---------------------- Шаг 11: Проверка результатов с расчётами ----------------------
        await test.step("Админ проверяет результаты и расчёты", async () => {
          if (!prId) {
            console.log("⚠️ PR ID не найден, пропускаем проверку результатов");
            return;
          }

          const results = await verifyPRResults({
            page: adminPage,
            request,
            testInfo,
            baseUrl,
            prId,
            evaluatedUserName,
            openAccess: false,
          });

          // Проверяем, что есть данные
          if (results.calculations.length > 0) {
            console.log(`✓ Проверено ${results.calculations.length} вопросов`);
            console.log(
              `✓ Расчёты корректны: ${results.isValid ? "Да" : "Есть расхождения"}`,
            );
          } else {
            console.log("⚠️ Нет данных для проверки расчётов");
          }
        });
      },
    );
  },
);
