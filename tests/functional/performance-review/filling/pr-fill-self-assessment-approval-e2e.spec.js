// tests/functional/performance-review/filling/pr-fill-self-assessment-approval-e2e.spec.js
// E2E тест: Performance Review - утверждение коллег ПОСЛЕ самооценки
//
// Тестируемый кейс:
// Кейс 3: Утверждение коллег руководителем ДО заполнения самооценки
//   Настройки: askEmployees=true, managerApproval=true, earlyAccess=true, showSelfAssessmentToColleagues=true
//
//   1. Оцениваемый выбирает коллег
//   2. Руководитель утверждает коллег
//   3. Но анкеты НЕ отправляются (ждём самооценку)
//   4. Оцениваемый заполняет самооценку
//   5. Анкеты отправляются руководителю И коллегам

import { test } from "../../../fixtures/auth.js";
import { expect } from "@playwright/test";
import { PerformanceReviewsListPage } from "../../../../pages/PerformanceReviewsListPage.js";
import { PerformanceReviewConfigPage } from "../../../../pages/PerformanceReviewConfigPage.js";
import { PerformanceReviewFillPage } from "../../../../pages/PerformanceReviewFillPage.js";
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
  DashboardTeamAPI,
  getCredentials,
  getTestUserPassword,
} from "../../../utils/api/index.js";

test.describe(
  "Performance Review - Самооценка ПОСЛЕ утверждения коллег",
  {
    tag: [
      "@performance-review",
      "@filling",
      "@e2e",
      "@self-assessment",
      "@regression",
      "@ui",
    ],
  },
  () => {
    test.beforeEach(() => {
      markAsE2ETest(
        MODULES.PERFORMANCE_REVIEW,
        "Self Assessment After Approval",
      );
    });

    /**
     * Кейс 3: Утверждение коллег ДО самооценки
     * Ожидание: анкеты руководителю и коллегам отправляются только после самооценки
     */
    test(
      "C4409: Кейс 3: утверждение коллег до самооценки - анкеты отправляются после самооценки",
      { tag: ["@critical"] },
      async ({ adminAuth: adminPage, browser, request }, testInfo) => {
        setSeverity("critical");
        test.slow();
        testInfo.setTimeout(600_000); // 10 минут

        const listPage = new PerformanceReviewsListPage(adminPage, testInfo);
        const configPage = new PerformanceReviewConfigPage(adminPage, testInfo);
        const orgHelper = new OrgStructureHelper(adminPage, testInfo);
        const userSession = createUserSession(browser, testInfo);

        let users = [];
        let colleagues = [];
        let managerUser = null;
        let evaluatedUserName = null;
        let prId = null;
        let revisionId = null;
        let revisionAlias = null;
        const baseUrl = new URL(process.env.BASE_URL).origin;
        const prName = `Кейс 3: Самооценка после утверждения ${Date.now()}`;

        // ---------------------- Шаг 1: Получение пользователей ----------------------
        await test.step("Получить список активных пользователей", async () => {
          await adminPage.goto(baseUrl, { waitUntil: "domcontentloaded" });

          users = await orgHelper.getUsersList(11);
          users = await filterValidUsers(users);
          console.log(`✓ Получено ${users.length} активных пользователей`);

          if (users.length < 5) {
            throw new Error(
              "Недостаточно пользователей для теста (нужно минимум 5)",
            );
          }

          evaluatedUserName = users[0]?.name || "Elena Shapoval";
          managerUser = users[1];
          colleagues = users.slice(2, 5);

          console.log(`Оцениваемый: ${evaluatedUserName}`);
          console.log(
            `Руководитель: ${managerUser.name} (${managerUser.email})`,
          );
          console.log(
            `Потенциальные коллеги: ${colleagues.map((u) => u.name).join(", ")}`,
          );
        });

        // ---------------------- Шаг 2: Создание PR ----------------------
        await test.step("Создать PR с утверждением коллег и показом самооценки", async () => {
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
            subordinates: false,
          });

          // Утверждение коллег + показ самооценки
          await configPage.configureColleaguesSelection({
            askEmployees: true,
            minColleagues: 2,
            maxColleagues: 5,
            managerApproval: true, // Утверждение руководителем
            earlyAccess: true, // Ранний доступ
            showSelfAssessmentToColleagues: true, // Анкеты после самооценки
          });

          console.log("✓ PR настроен с утверждением коллег + показ самооценки");
        });

        // ---------------------- Шаг 3: Добавление участников и запуск ----------------------
        await test.step("Добавить участников и запустить PR", async () => {
          await configPage.addTargetUsers({ count: 1 });
          await configPage.editRespondentsTable({ managers: [managerUser] });
          await configPage.disableReminders();
          await configPage.addAssessmentsForAllDirections();
          await configPage.goToStep("launch");
          await configPage.launchAndSendQuestionnaires();

          // Извлекаем prId из URL (обязателен для корректной навигации)
          const currentUrl = adminPage.url();
          const match = currentUrl.match(/\/performance-reviews\/(\d+)/);
          if (match) {
            prId = match[1];
            console.log(`✓ PR запущен, ID: ${prId}`);
          } else {
            throw new Error(`Не удалось извлечь PR ID из URL: ${currentUrl}`);
          }

          // Получаем alias ревизии через API — нужен для прямой навигации
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);
          const { data: revision } = await prAPI.getLastRevision(prId);
          revisionId = revision?.id;
          revisionAlias = revision?.alias;
          console.log(`✓ Revision ID: ${revisionId}, alias: ${revisionAlias}`);
        });

        // ---------------------- Шаг 4: Оцениваемый выбирает коллег через API ----------------------
        // UI-навигация через alias URL нестабильна (SSR 404), поэтому используем private API —
        // тот же механизм, что и фронтенд.
        await test.step("Оцениваемый выбирает коллег через API", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email: adminEmail, password: adminPass } =
            getCredentials("admin");
          await prAPI.signIn(adminEmail, adminPass);

          // 1. Получаем nomination для ревизии
          const { data: nominationData } = await prAPI.get(
            `/manager/performance-reviews/${prId}/nominations/of-revision/${revisionId}/`,
          );
          if (!nominationData?.id) {
            throw new Error("Nomination не найдена для данной ревизии");
          }
          const nominationId = nominationData.id;
          console.log(`Nomination ID: ${nominationId}`);

          // 2. Получаем target users для PR → находим PerformanceReviewTargetUser ID
          const { data: targetUsersData } = await prAPI.getTargetUsers(prId);
          const targetUsers = targetUsersData?.items || targetUsersData || [];
          if (targetUsers.length === 0) {
            throw new Error("Target users не найдены в PR");
          }
          const targetUserId = targetUsers[0].id;
          console.log(`PerformanceReviewTargetUser ID: ${targetUserId}`);

          // 3. Получаем PerformanceReviewNominationTargetUser ID
          const { data: nomTargetData } = await prAPI.post(
            `/manager/performance-reviews/${prId}/nominations/${nominationId}/target-users/get`,
            { targetUsersIds: [targetUserId] },
          );
          const nomTargetUsers = nomTargetData?.items || nomTargetData || [];
          if (nomTargetUsers.length === 0) {
            throw new Error("PerformanceReviewNominationTargetUser не найден");
          }
          const nominationTargetUserId = nomTargetUsers[0].id;
          console.log(`NominationTargetUser ID: ${nominationTargetUserId}`);

          // 4. Извлекаем userId из имён коллег (seed-данные: "FirstName {userId} LastName {userId}")
          // /manager/users/?limit=N не работает — 2000+ пользователей в компании.
          const colleagueUserIds = [];
          for (const colleague of colleagues.slice(0, 2)) {
            const match = colleague.name.match(/\b(\d{4,6})\b/);
            if (match) {
              colleagueUserIds.push(parseInt(match[1], 10));
              console.log(`  ✓ ${colleague.name}: userId=${match[1]}`);
            } else {
              console.log(
                `  ⚠️ ${colleague.name}: не удалось извлечь userId из имени`,
              );
            }
          }

          if (colleagueUserIds.length < 2) {
            throw new Error(
              `Не удалось извлечь userId из имён коллег. ` +
                `Найдено: ${colleagueUserIds.length}/2`,
            );
          }
          console.log(`Colleague IDs: ${colleagueUserIds.join(", ")}`);

          // 5. Авторизуемся как оцениваемый и отправляем номинацию
          const userAPI = new DashboardTeamAPI(request);
          await userAPI.signIn(users[0].email, getTestUserPassword());

          // 6. Предлагаем коллег
          const { response: suggestResp, data: suggestData } =
            await userAPI.suggestReceivers(prId, nominationId, {
              targetUserId: nominationTargetUserId,
              receiversIds: colleagueUserIds,
            });
          if (!suggestResp.ok()) {
            const errBody = suggestData
              ? JSON.stringify(suggestData).substring(0, 300)
              : "no body";
            throw new Error(
              `suggestReceivers failed: HTTP ${suggestResp.status()} — ${errBody}`,
            );
          }
          console.log("✓ Коллеги предложены");

          // 7. Подтверждаем номинацию
          const { response: submitResp } = await userAPI.submitNomination(
            prId,
            nominationId,
            { targetUserId: nominationTargetUserId },
          );
          if (!submitResp.ok()) {
            throw new Error(
              `submitNomination failed: HTTP ${submitResp.status()}`,
            );
          }
          console.log("✓ Номинация отправлена через API");
          console.log(
            `✓ Номинированные коллеги: ${colleagues
              .slice(0, 2)
              .map((c) => c.name)
              .join(", ")}`,
          );
        });

        // ---------------------- Шаг 5: Утверждение коллег через API ----------------------
        // С earlyAccess=true нет отдельного этапа номинации: утверждение — async step.
        // UI-кнопка «Утвердить» на главной менеджера появляется с задержкой и нестабильно.
        // Фронт использует тот же API-метод approve-suggestions — вызываем его напрямую.
        await test.step("Утвердить коллег через API (async-step approve-suggestions)", async () => {
          const prAPI = new PerformanceReviewAPI(request);
          const { email, password } = getCredentials("admin");
          await prAPI.signIn(email, password);

          // API approve-suggestions ожидает РЕАЛЬНЫЕ user ID (из таблицы users),
          // а НЕ PerformanceReviewTargetUser ID. Извлекаем из seed-имени.
          const evalMatch = users[0].name.match(/\b(\d{4,6})\b/);
          if (!evalMatch) {
            throw new Error(
              `Не удалось извлечь userId из имени: ${users[0].name}`,
            );
          }
          const evaluatedUserId = parseInt(evalMatch[1], 10);
          console.log(`Evaluated user ID (из имени): ${evaluatedUserId}`);

          const { response, data } = await prAPI.asyncStepsApproveSuggestion(
            prId,
            { usersIds: [evaluatedUserId] },
          );
          console.log(`approve-suggestions: HTTP ${response.status()}`);

          if (!response.ok()) {
            console.log(
              `approve-suggestions response: ${JSON.stringify(data)}`,
            );
            if (response.status() !== 409) {
              throw new Error(
                `Не удалось утвердить коллег: HTTP ${response.status()} — ${JSON.stringify(data)}`,
              );
            }
            console.log(
              "⚠️ 409 Conflict — коллеги возможно уже утверждены, продолжаем",
            );
          } else {
            console.log("✓ Коллеги утверждены через API");
          }

          // Ждём обработки на бэкенде
          await new Promise((r) => setTimeout(r, 3000));
        });

        // ---------------------- Шаг 6: ПРОВЕРКА - Руководитель НЕ видит анкету ----------------------
        await test.step("Проверить что руководитель НЕ видит анкету (ждём самооценку)", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");

            // Фильтруем по КОНКРЕТНОМУ PR
            const prBlock = page
              .locator('[class*="PerformanceReviewSummaryNotification"]')
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            // Блок PR может быть виден (задача утверждения коллег уже выполнена)
            let isBlockVisible = false;
            try {
              await prBlock
              .waitFor({ state: "visible", timeout: 5000 })
              isBlockVisible = true;
            } catch {}

            if (isBlockVisible) {
              // Считаем количество задач в блоке (элементы с прогрессом/чекбоксом)
              // Задача "Утвердите коллег" уже есть (выполнена), ищем ВТОРУЮ задачу (анкета)
              const taskItems = prBlock.locator(
                '[class*="ProgressLine"], [class*="TaskItem"], [class*="task-item"]',
              );
              const taskCount = await taskItems.count();
              console.log(`Количество задач в блоке: ${taskCount}`);

              // Если только 1 задача (утверждение коллег) - анкеты нет
              // Если 2+ задач - появилась задача на заполнение анкеты
              if (taskCount <= 1) {
                console.log(
                  "✓ Руководитель НЕ видит задачу на заполнение анкеты (ждём самооценку)",
                );
              } else {
                throw new Error(
                  `Руководитель видит ${taskCount} задач - анкета появилась до самооценки`,
                );
              }
            } else {
              console.log("✓ Блок PR не виден - анкеты точно нет");
            }
          });
        });

        // ---------------------- Шаг 7: ПРОВЕРКА - Коллеги НЕ видят анкеты ----------------------
        await test.step("Проверить что коллеги НЕ видят анкеты (ждём самооценку)", async () => {
          if (colleagues.length === 0) return;

          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");

            // Фильтруем по КОНКРЕТНОМУ PR
            const prBlock = page
              .locator('[class*="PerformanceReviewSummaryNotification"]')
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            // Коллеги утверждены, но самооценка не заполнена - анкет быть не должно
            await expect(prBlock).not.toBeVisible({ timeout: 5000 });
            console.log(
              `✓ Коллега ${firstColleague.name} НЕ видит блок для этого PR (ждём самооценку)`,
            );
          });
        });

        // ---------------------- Шаг 8: Заполнение самооценки через populateReview ----------------------
        // populateReview от админа создаёт response-записи и заполняет все доступные анкеты.
        // В данном случае доступна только самооценка (head/colleague заблокированы
        // showSelfAssessmentToColleagues=true до завершения самооценки).
        // Этот же подход используется в проходящих тестах C3026 и C4410.
        await test.step("Заполнить самооценку через populateReview", async () => {
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
          for (let attempt = 1; attempt <= 15; attempt++) {
            const { response } = await prAPI.populateReview(
              prId,
              populateSettings,
              { timeout: 120000 },
            );
            if (response.ok()) {
              filledCount++;
              await new Promise((r) => setTimeout(r, 100));
            } else if (response.status() === 500) {
              break;
            } else {
              console.log(
                `populateReview: HTTP ${response.status()} на попытке ${attempt}`,
              );
              break;
            }
          }
          console.log(`populateReview: ${filledCount} анкет заполнено`);
          if (filledCount === 0) {
            throw new Error("populateReview не заполнил ни одной анкеты");
          }
          console.log("✓ Самооценка заполнена через populateReview");

          // С earlyAccess=true + managerApproval=true система автоматически
          // создаёт revision-users для коллег после завершения самооценки
          // (если номинация утверждена через async-steps).
          // stopNominationStage возвращает 403 в этой конфигурации.
          await new Promise((r) => setTimeout(r, 5000));
        });

        // ---------------------- Шаг 9: ПРОВЕРКА - Руководитель ТЕПЕРЬ видит анкету ----------------------
        await test.step("Проверить что руководитель ВИДИТ анкету после самооценки", async () => {
          await userSession.runAs(managerUser, async (page) => {
            await page.goto(new URL("/ru/", baseUrl).toString());
            await page.waitForLoadState("networkidle");

            // Фильтруем по КОНКРЕТНОМУ PR
            const prBlock = page
              .locator('[class*="PerformanceReviewSummaryNotification"]')
              .filter({
                has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
              })
              .first();

            let isVisible = false;
            try {
              await prBlock
              .waitFor({ state: "visible", timeout: 15000 })
              isVisible = true;
            } catch {}

            // Retry с перезагрузкой — бэкенд мог не успеть отправить анкеты
            if (!isVisible) {
              console.log("⚠️ Блок не виден, перезагружаем страницу...");
              await page.reload();
              await page.waitForLoadState("networkidle");
              isVisible = false;
              try {
                await prBlock
                .waitFor({ state: "visible", timeout: 15000 })
                isVisible = true;
              } catch {}
            }

            if (!isVisible) {
              throw new Error(
                `Руководитель НЕ видит блок PR ${prId} после самооценки`,
              );
            }

            console.log("✓ Руководитель ВИДИТ блок PR после самооценки");

            // Проверяем наличие задачи на заполнение анкеты
            let hasEvaluateText = false;
            try {
              await prBlock
              .locator("text=/оцените|заполните анкет/i")
              .waitFor({ state: "visible", timeout: 3000 })
              hasEvaluateText = true;
            } catch {}
            if (hasEvaluateText) {
              console.log("✓ Руководитель ВИДИТ задачу на заполнение анкеты");
            } else {
              console.log(
                "⚠️ Текст задачи на заполнение не найден, но блок виден",
              );
            }
          });
        });

        // ---------------------- Шаг 10: ПРОВЕРКА - Коллеги ТЕПЕРЬ видят анкеты ----------------------
        await test.step("Проверить что коллеги ВИДЯТ анкеты после самооценки", async () => {
          if (colleagues.length === 0) return;

          const firstColleague = colleagues[0];
          await userSession.runAs(firstColleague, async (page) => {
            // Бэкенд автоматически отправляет анкеты коллегам после самооценки.
            // Retry: до 5 попыток с интервалом 10 секунд.
            const MAX_RETRIES = 5;
            let isVisible = false;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
              await page.goto(new URL("/ru/", baseUrl).toString());
              await page.waitForLoadState("networkidle");

              // Фильтруем по КОНКРЕТНОМУ PR
              const prBlock = page
                .locator('[class*="PerformanceReviewSummaryNotification"]')
                .filter({
                  has: page.locator(`a[href*="/performance-reviews/${prId}/"]`),
                })
                .first();

              isVisible = false;
              try {
                await prBlock
                .waitFor({ state: "visible", timeout: 15000 })
                isVisible = true;
              } catch {}

              if (isVisible) {
                console.log(
                  `✓ Коллега ${firstColleague.name} ВИДИТ блок для этого PR после самооценки (попытка ${attempt})`,
                );
                break;
              }

              if (attempt < MAX_RETRIES) {
                console.log(
                  `⚠️ Блок не виден (попытка ${attempt}/${MAX_RETRIES}), ждём 10с и перезагружаем...`,
                );
                await new Promise((r) => setTimeout(r, 10000));
              }
            }

            if (!isVisible) {
              throw new Error(
                `Коллега ${firstColleague.name} НЕ видит блок PR ${prId} после самооценки (после ${MAX_RETRIES} попыток)`,
              );
            }
          });
        });

        // ---------------------- Шаг 11: Заполнение анкет респондентами ----------------------
        await test.step("Руководитель и коллеги заполняют анкеты", async () => {
          // Руководитель
          await userSession.runAs(managerUser, async (page) => {
            const fillPage = new PerformanceReviewFillPage(page, testInfo);
            await fillPage.fillQuestionnaireForEvaluated(
              baseUrl,
              evaluatedUserName,
              prId,
              { revisionAlias },
            );
            console.log("✓ Оценка от руководителя заполнена");
          });

          // Коллеги (только первые 2 — столько было номинировано в step 4)
          for (const colleague of colleagues.slice(0, 2)) {
            await userSession.runAs(colleague, async (page) => {
              const fillPage = new PerformanceReviewFillPage(page, testInfo);
              await fillPage.fillQuestionnaireForEvaluated(
                baseUrl,
                evaluatedUserName,
                prId,
                { revisionAlias },
              );
              console.log(`✓ Оценка от коллеги ${colleague.name} заполнена`);
            });
          }
        });

        console.log(
          "✅ Кейс 3 завершён: при утверждении коллег ДО самооценки, анкеты отправляются только ПОСЛЕ самооценки",
        );
      },
    );
  },
);
